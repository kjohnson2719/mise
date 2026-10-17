import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { createTestDatabase } from "../test/database.ts"
import { Household, Recipe, SHARED_TABLES } from "./entities/index.ts"
import type { Database } from "./orm.ts"
import {
  ACROSS_HOUSEHOLDS,
  HOUSEHOLD_FILTER,
  NOT_DELETED_FILTER,
  forHousehold,
} from "./scope.ts"

let database: Database
let close: () => Promise<void>
let home: string
let nextDoor: string

beforeAll(async () => {
  ;({ database, close } = await createTestDatabase())

  const em = database.em.fork()
  const homeHousehold = em.create(Household, { name: "Home", slug: "home" })
  const nextDoorHousehold = em.create(Household, {
    name: "Next Door",
    slug: "next-door",
  })
  em.create(Recipe, {
    household: homeHousehold,
    slug: "soup",
    name: "Soup",
    origin: "manual",
  })
  em.create(Recipe, {
    household: nextDoorHousehold,
    slug: "stew",
    name: "Stew",
    origin: "manual",
  })
  await em.flush()
  home = homeHousehold.id
  nextDoor = nextDoorHousehold.id
})

afterAll(() => close())

describe("households can't reach each other's data", () => {
  test("every table belongs to a household, or is on the shared list", () => {
    for (const meta of Object.values(database.getMetadata().getAll())) {
      const table = meta.tableName
      const owned = "household" in meta.properties
      if (SHARED_TABLES.includes(table)) {
        expect(owned, `${table} is shared, so has no household`).toBe(false)
        continue
      }
      expect(owned, `${table} needs a household`).toBe(true)
      expect(
        meta.filters[HOUSEHOLD_FILTER]?.default,
        `${table} needs the household filter, on by default`
      ).toBe(true)
    }
  })

  test("a query or delete without a household is refused", async () => {
    const em = database.em.fork()

    await expect(em.find(Recipe, {})).rejects.toThrow(/filter 'household'/)
    await expect(em.nativeDelete(Recipe, {})).rejects.toThrow(
      /filter 'household'/
    )
  })

  test("a household sees only its own rows", async () => {
    const recipes = await forHousehold(database.em, home).find(Recipe, {})

    expect(recipes.map((recipe) => recipe.name)).toEqual(["Soup"])
  })

  test("asking for another household's row by id finds nothing", async () => {
    const stew = await database.em
      .fork()
      .findOneOrFail(Recipe, { slug: "stew" }, ACROSS_HOUSEHOLDS)

    expect(
      await forHousehold(database.em, home).findOne(Recipe, stew.id)
    ).toBeNull()
  })

  test("updates stay in the household", async () => {
    await forHousehold(database.em, home).nativeUpdate(
      Recipe,
      {},
      { rating: 5 }
    )

    const all = await database.em.fork().find(Recipe, {}, ACROSS_HOUSEHOLDS)
    const ratings = Object.fromEntries(all.map((r) => [r.name, r.rating]))
    expect(ratings).toEqual({ Soup: 5, Stew: null })
  })

  test("server-wide work sees every household, when it asks to", async () => {
    const all = await database.em.fork().find(Recipe, {}, ACROSS_HOUSEHOLDS)

    expect(all.map((recipe) => recipe.name).sort()).toEqual(["Soup", "Stew"])
  })
})

describe("recently deleted recipes", () => {
  test("are left out unless asked for", async () => {
    const em = forHousehold(database.em, nextDoor)
    await em.nativeUpdate(Recipe, { slug: "stew" }, { deletedAt: new Date() })

    expect(await em.find(Recipe, {})).toEqual([])
    const withDeleted = await em.find(
      Recipe,
      {},
      { filters: { [NOT_DELETED_FILTER]: false } }
    )
    expect(withDeleted.map((recipe) => recipe.name)).toEqual(["Stew"])
  })
})

describe("deleting a household", () => {
  test("deletes everything in it, and nothing else", async () => {
    await database.em.fork().nativeDelete(Household, { id: nextDoor })

    const left = await database.em
      .fork()
      .find(
        Recipe,
        {},
        { filters: { [HOUSEHOLD_FILTER]: false, [NOT_DELETED_FILTER]: false } }
      )
    expect(left.map((recipe) => recipe.name)).toEqual(["Soup"])
  })
})
