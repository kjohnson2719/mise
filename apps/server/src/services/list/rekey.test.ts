import { afterAll, beforeAll, expect, test } from "vitest"
import {
  FoodPlacement,
  Purchase,
  ShoppingItem,
} from "../../database/entities/index.ts"
import type { Database } from "../../database/orm.ts"
import { forHousehold } from "../../database/scope.ts"
import { createTestApp, setUpServer } from "../../test/app.ts"
import { rekeyHousehold } from "./rekey.ts"

// Food keys made again: a list made before names were tidied, as it was
// left, tidied and joined up.

let database: Database
let close: () => Promise<void>
let householdId: string
let listId: string
let aisleId: string

beforeAll(async () => {
  const test = await createTestApp()
  ;({ database, close } = test)
  const kyle = await setUpServer(test.app, test.setupCode)
  householdId = (await (await kyle.get("/api/households/current")).json()).id
  const list = await (await kyle.get("/api/list")).json()
  listId = list.lists[0].id
  aisleId = list.aisles[0].id
})

afterAll(() => close())

test("tidies names from the plan, makes keys again, and joins lines", async () => {
  const em = forHousehold(database.em.fork(), householdId)
  const add = (
    name: string,
    quantity: number | null,
    unit: string | null,
    source: "plan" | "typed" = "plan",
    at = 0
  ) =>
    em.create(ShoppingItem, {
      household: householdId,
      list: listId,
      foodKey: name.toLowerCase(),
      name,
      quantity,
      unit,
      aisle: null,
      source,
      forMeals: [{ meal: `meal-${name}`, quantity, unit }],
      createdAt: new Date(Date.now() + at),
    })
  add("lemon wedges to serve", null, null, "plan", 0)
  add("lemon", 4, null, "plan", 1)
  add("garlic", 1, "head", "plan", 2)
  add("garlic", 6, "clove", "plan", 3)
  add("chopped parsley", 2, "tablespoon", "plan", 4)
  add("parsley", 2, "tablespoon", "plan", 5)
  add("(75 g) butter", 0.5, "cup", "plan", 6)
  add("Pinch of salt", null, null, "typed", 7)
  add("cooking salt", 3, "teaspoon", "plan", 8)
  add("cooking salt", 0.75, "teaspoon", "plan", 9)
  em.create(FoodPlacement, {
    household: householdId,
    foodKey: "chopped parsley",
    aisle: aisleId,
  })
  em.create(FoodPlacement, {
    household: householdId,
    foodKey: "parsley",
    aisle: aisleId,
  })
  em.create(Purchase, {
    household: householdId,
    foodKey: "old",
    name: "Boneless skinless chicken thighs",
    quantity: 2,
    unit: "pound",
    boughtOn: "2026-10-01",
  })
  await em.flush()

  const done = await rekeyHousehold(forHousehold(em, householdId))
  expect(done).toEqual({ renamed: 3, joined: 5 })

  const after = forHousehold(database.em.fork(), householdId)
  const items = await after.find(
    ShoppingItem,
    {},
    { orderBy: { createdAt: "asc" } }
  )
  expect(
    items.map((item) => [
      item.name,
      item.foodKey,
      item.quantity === null ? null : Number(item.quantity),
      item.unit,
    ])
  ).toEqual([
    // The wedges' line takes the lemons', with its name.
    ["lemon", "lemon", 4, null],
    ["garlic", "garlic", 16, "clove"],
    ["parsley", "parsley", 4, "tablespoon"],
    ["butter", "butter", 0.5, "cup"],
    // Salt with no amount joins the cooking salt's teaspoons, and the line
    // takes the name that goes with the amount.
    ["cooking salt", "salt", 3.75, "teaspoon"],
  ])
  // Each meal's share goes with the line it joined.
  expect(items[1]!.forMeals?.map((share) => share.meal)).toEqual([
    "meal-garlic",
    "meal-garlic",
  ])
  // Two aisle choices for one food: one is left, with the food's key.
  expect(
    (await after.find(FoodPlacement, {})).map((row) => row.foodKey)
  ).toEqual(["parsley"])

  // Purchases are keyed as the pantry keys food, for usual buys.
  expect((await after.find(Purchase, {})).map((row) => row.foodKey)).toEqual([
    "chicken thigh",
  ])

  // Again, nothing changes.
  expect(
    await rekeyHousehold(forHousehold(database.em.fork(), householdId))
  ).toEqual({
    renamed: 0,
    joined: 0,
  })
})
