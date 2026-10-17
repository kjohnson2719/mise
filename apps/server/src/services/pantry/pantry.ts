import {
  addAmounts,
  clockIn,
  formatAmount,
  guessStorage,
  guessUseBy,
  foodKey,
  readAmount,
  readItem,
  subtractAmounts,
  whyUseSoon,
  type Amount,
  type AisleKey,
  type MealShare,
  type StoragePlace,
} from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import { AppError } from "../../core/errors.ts"
import {
  Aisle,
  Household,
  PantryItem,
  PlanEntry,
  STORAGE_PLACES,
} from "../../database/entities/index.ts"
import { householdKeys } from "../list/food-aliases.ts"
import { HOUSEHOLD_FILTER, NOT_DELETED_FILTER } from "../../database/scope.ts"
import { aislesOf, findAisle, householdAisles } from "../list/aisles.ts"
import { inHouseholdTransaction, toNumber } from "../recipes/recipes.ts"

// What's at home, kept in the fridge, the freezer or the cupboard. It
// goes in from the list when the shopping's put away, or typed in, and
// cooking a planned meal uses it up. Each thing remembers how much of it
// is set aside for which planned meals, so the same stock isn't counted
// on twice.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The household's today, in its time zone. */
export async function householdToday(em: EntityManager, householdId: string) {
  const household = await em.findOneOrFail(Household, { id: householdId })
  return clockIn(household.timeZone).today
}

export type PantryMealInfo = {
  id: string
  name: string
  date: string
  status: PlanEntry["status"]
}

/** The planned meals things at home are set aside for, by id. */
export async function pantryMeals(
  em: EntityManager,
  items: readonly PantryItem[]
) {
  const ids = [
    ...new Set(
      items.flatMap((item) => (item.forMeals ?? []).map((share) => share.meal))
    ),
  ]
  if (ids.length === 0) return new Map<string, PantryMealInfo>()
  const entries = await em.find(
    PlanEntry,
    { id: { $in: ids } },
    { populate: ["recipe"], filters: { [NOT_DELETED_FILTER]: false } }
  )
  return new Map(
    entries.map((entry) => [
      entry.id,
      {
        id: entry.id,
        name: entry.recipe?.getEntity().name ?? entry.note ?? "",
        date: entry.date,
        status: entry.status,
      },
    ])
  )
}

/** Whether a meal is still to come, so what's set aside for it stays set aside. */
export const stillToCome = (meal: PantryMealInfo | undefined, today: string) =>
  meal?.status === "planned" && meal.date >= weekBefore(today)

/** A week's pool is dated to its first day, up to six days before today. */
const weekBefore = (today: string) => {
  const date = new Date(`${today}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - 6)
  return date.toISOString().slice(0, 10)
}

export const amountOf = (item: PantryItem): Amount => ({
  quantity: toNumber(item.quantity),
  unit: item.unit ?? null,
})

/** Whether an amount says how much, rather than "half a bag" or just "have it". */
export const measured = (item: PantryItem) =>
  item.quantity !== null && item.quantity !== undefined && !item.amountText

/**
 * How much of something at home is free: what's there, less what's set
 * aside for meals (`setAside` says which still count). Null when there's
 * no telling (no amount, or one in words), which counts as enough.
 */
export function available(
  item: PantryItem,
  setAside: (meal: string) => boolean
): Amount | null {
  if (!measured(item)) return null
  let left = amountOf(item)
  for (const share of item.forMeals ?? []) {
    if (!setAside(share.meal)) continue
    const rest = subtractAmounts(left, share, item.foodKey)
    if (rest) left = rest
  }
  return left
}

/** Something at home as the API shows it. */
function describeItem(
  item: PantryItem,
  meals: ReadonlyMap<string, PantryMealInfo>,
  aisleKeys: ReadonlyMap<string, AisleKey | null>,
  today: string
) {
  const quantity = toNumber(item.quantity)
  const forMeals = [
    ...new Set((item.forMeals ?? []).map((share) => share.meal)),
  ].flatMap((id) => {
    const meal = meals.get(id)
    return meal ? [meal] : []
  })
  return {
    id: item.id,
    name: item.name,
    amount: item.amountText ?? formatAmount(quantity, item.unit ?? null),
    quantity,
    unit: item.unit ?? null,
    amountText: item.amountText ?? null,
    storedIn: item.storedIn ?? null,
    aisle: item.aisle?.id ?? null,
    useBy: item.useBy ?? null,
    meals: forMeals,
    useSoon: whyUseSoon(
      {
        useBy: item.useBy ?? null,
        storedIn: item.storedIn ?? null,
        aisle: aisleKeys.get(item.aisle?.id ?? "") ?? null,
        meals: forMeals,
      },
      today
    ),
    createdAt: item.createdAt.toISOString(),
  }
}

export async function describeItems(
  em: EntityManager,
  householdId: string,
  items: readonly PantryItem[]
) {
  const [meals, aisles, today] = await Promise.all([
    pantryMeals(em, items),
    householdAisles(em, householdId),
    householdToday(em, householdId),
  ])
  const keys = new Map(
    aisles.map((aisle) => [aisle.id, (aisle.key as AisleKey | null) ?? null])
  )
  return items.map((item) => describeItem(item, meals, keys, today))
}

/** What's at home: the fridge, the freezer, then the cupboard; by aisle in each. */
export async function getPantry(em: EntityManager, householdId: string) {
  const aisles = await householdAisles(em, householdId)
  const order = new Map(aisles.map((aisle) => [aisle.id, aisle.position]))
  const place = (item: PantryItem) =>
    item.storedIn
      ? STORAGE_PLACES.indexOf(item.storedIn)
      : STORAGE_PLACES.length
  const items = (await em.find(PantryItem, {})).sort(
    (a, b) =>
      place(a) - place(b) ||
      (order.get(a.aisle?.id ?? "") ?? aisles.length) -
        (order.get(b.aisle?.id ?? "") ?? aisles.length) ||
      a.name.localeCompare(b.name)
  )
  return { items: await describeItems(em, householdId, items) }
}

async function findItem(em: EntityManager, id: string) {
  const item = UUID.test(id) ? await em.findOne(PantryItem, { id }) : null
  if (!item) {
    throw new AppError(
      "not_found",
      "pantry_item_not_found",
      "That isn't in the pantry."
    )
  }
  return item
}

export type Stock = {
  name: string
  quantity: number | null
  unit: string | null
  amountText: string | null
  aisle: Aisle | null
  storedIn: StoragePlace | null
  useBy: string | null
  forMeals: MealShare[]
}

/**
 * Puts something in the pantry. The same food kept in the same place
 * goes with what's there when the amounts add up (or one is just "have
 * it"), keeping the earlier use-by date; otherwise it's a thing of its own.
 */
export async function store(
  em: EntityManager,
  householdId: string,
  stock: Stock
) {
  const keyOf = await householdKeys(em)
  const key = keyOf(stock.name)
  const same = await em.find(PantryItem, {
    foodKey: key,
    storedIn: stock.storedIn,
  })
  const hasAmount = (amount: {
    quantity: number | null
    amountText: string | null
  }) => amount.quantity !== null || amount.amountText !== null
  for (const item of same) {
    const current = {
      quantity: toNumber(item.quantity),
      unit: item.unit ?? null,
      amountText: item.amountText ?? null,
    }
    let amount: typeof current | null = null
    if (!hasAmount(current)) amount = stock
    else if (!hasAmount(stock)) amount = current
    else if (!current.amountText && !stock.amountText) {
      const sum = addAmounts(current, stock, item.foodKey)
      if (sum) amount = { ...sum, amountText: null }
    }
    if (!amount) continue
    em.assign(item, {
      quantity: amount.quantity,
      unit: amount.unit,
      amountText: amount.amountText,
      useBy:
        item.useBy && stock.useBy
          ? item.useBy < stock.useBy
            ? item.useBy
            : stock.useBy
          : (item.useBy ?? stock.useBy),
      forMeals: merged([...(item.forMeals ?? []), ...stock.forMeals]),
    })
    return item
  }
  return em.create(PantryItem, {
    household: householdId,
    foodKey: key,
    name: stock.name,
    quantity: stock.quantity,
    unit: stock.unit,
    amountText: stock.amountText,
    aisle: stock.aisle,
    storedIn: stock.storedIn,
    useBy: stock.useBy,
    forMeals: stock.forMeals.length > 0 ? merged(stock.forMeals) : null,
  })
}

/** Each meal's shares as one, where they add up. */
export function merged(shares: readonly MealShare[]) {
  const out: MealShare[] = []
  for (const share of shares) {
    const index = out.findIndex((other) => other.meal === share.meal)
    const sum = index === -1 ? null : addAmounts(out[index]!, share)
    if (index !== -1 && sum) out[index] = { meal: share.meal, ...sum }
    else out.push({ ...share })
  }
  return out
}

/** Where a new thing at home goes, and its use-by guess: from its aisle. */
export async function placeFor(
  em: EntityManager,
  householdId: string,
  food: { name: string; unit?: string | null; aisle?: Aisle | null },
  today: string
) {
  const aisle =
    food.aisle === undefined
      ? ((await aislesOf(em, householdId, [food]))[0] ?? null)
      : food.aisle
  const key = (aisle?.key as AisleKey | null | undefined) ?? null
  const storedIn = guessStorage(food.name, key)
  return {
    aisle,
    storedIn,
    useBy: guessUseBy(food.name, key, storedIn, today),
  }
}

/** Something typed in: "2 lb chicken thighs" or "rice". */
export async function addTyped(
  em: EntityManager,
  householdId: string,
  input: { text: string; storedIn?: StoragePlace | null }
) {
  const { name, quantity, unit } = readItem(input.text)
  if (!name) {
    throw new AppError("invalid", "invalid_item", "Say what to add.", {
      text: "Say what to add.",
    })
  }
  const today = await householdToday(em, householdId)
  const place = await placeFor(em, householdId, { name, unit }, today)
  const storedIn = input.storedIn ?? place.storedIn
  const item = await store(em, householdId, {
    name,
    quantity,
    unit,
    amountText: null,
    aisle: place.aisle,
    storedIn,
    useBy:
      storedIn === place.storedIn
        ? place.useBy
        : storedIn === "freezer"
          ? null
          : place.useBy,
    forMeals: [],
  })
  await em.flush()
  return (await describeItems(em, householdId, [item]))[0]!
}

export type PantryChanges = Partial<{
  name: string
  /** As typed: "2 lb", "half a bag", or empty for just "have it". */
  amount: string
  storedIn: StoragePlace | null
  useBy: string | null
  aisle: string | null
}>

export async function updateItem(
  em: EntityManager,
  householdId: string,
  id: string,
  changes: PantryChanges
) {
  const keyOf = await householdKeys(em)
  const item = await findItem(em, id)
  if (changes.name !== undefined) {
    item.name = changes.name.trim()
    item.foodKey = keyOf(item.name)
  }
  if (changes.amount !== undefined) em.assign(item, readAmount(changes.amount))
  if (changes.storedIn !== undefined) {
    item.storedIn = changes.storedIn
    // The freezer keeps it.
    if (changes.storedIn === "freezer" && changes.useBy === undefined)
      item.useBy = null
  }
  if (changes.useBy !== undefined) item.useBy = changes.useBy
  if (changes.aisle !== undefined) {
    const aisle = changes.aisle ? await findAisle(em, changes.aisle) : null
    item.aisle = aisle
      ? em.getReference(Aisle, aisle.id, { wrapped: true })
      : null
  }
  await em.flush()
  return (await describeItems(em, householdId, [item]))[0]!
}

/** Something at home as it was, to put it back as it was (Undo). */
export function itemSnapshot(item: PantryItem) {
  return {
    id: item.id,
    name: item.name,
    foodKey: item.foodKey,
    quantity: toNumber(item.quantity),
    unit: item.unit ?? null,
    amountText: item.amountText ?? null,
    aisle: item.aisle?.id ?? null,
    storedIn: item.storedIn ?? null,
    useBy: item.useBy ?? null,
    forMeals: item.forMeals ?? null,
    createdAt: item.createdAt.toISOString(),
  }
}

export type PantrySnapshotItem = ReturnType<typeof itemSnapshot>

/** Used up, or thrown out: says what it was, for Undo. */
export async function removeItem(em: EntityManager, id: string) {
  const item = await findItem(em, id)
  const before = itemSnapshot(item)
  em.remove(item)
  await em.flush()
  return before
}

export type PantryBulk =
  | { action: "remove" }
  | { action: "storedIn"; storedIn: StoragePlace | null }
  | { action: "useBy"; useBy: string | null }

/**
 * Several things at once, all or none: used up, moved to the fridge,
 * freezer or cupboard, or given a use-by date. Says what they were, for
 * Undo. Ids not in the pantry are passed over.
 */
export async function bulkItems(
  em: EntityManager,
  householdId: string,
  ids: readonly string[],
  bulk: PantryBulk
) {
  return inHouseholdTransaction(em, householdId, async (tx) => {
    const items = await tx.find(PantryItem, {
      id: { $in: ids.filter((id) => UUID.test(id)) },
    })
    const before = items.map(itemSnapshot)
    for (const item of items) {
      if (bulk.action === "remove") tx.remove(item)
      else if (bulk.action === "storedIn") {
        item.storedIn = bulk.storedIn
        if (bulk.storedIn === "freezer") item.useBy = null
      } else item.useBy = bulk.useBy
    }
    await tx.flush()
    return { changed: items.length, before }
  })
}

/** Everything out of the pantry. Says what was there, for Undo. */
export async function clearPantry(em: EntityManager, householdId: string) {
  return inHouseholdTransaction(em, householdId, async (tx) => {
    const items = await tx.find(PantryItem, {})
    const before = items.map(itemSnapshot)
    for (const item of items) tx.remove(item)
    await tx.flush()
    return { before }
  })
}

/**
 * Puts things back as they were (Undo). An id another household has can't
 * come back here, and an aisle that's gone is left empty.
 */
export async function restoreItems(
  em: EntityManager,
  householdId: string,
  snapshots: readonly PantrySnapshotItem[]
) {
  const keyOf = await householdKeys(em)
  return inHouseholdTransaction(em, householdId, async (tx) => {
    const aisles = new Map(
      (await householdAisles(tx, householdId)).map((aisle) => [aisle.id, aisle])
    )
    const restored: PantryItem[] = []
    for (const snapshot of snapshots) {
      if (!UUID.test(snapshot.id)) continue
      let item = await tx.findOne(PantryItem, { id: snapshot.id })
      if (!item) {
        const elsewhere = await tx.count(
          PantryItem,
          { id: snapshot.id },
          { filters: { [HOUSEHOLD_FILTER]: false } }
        )
        if (elsewhere > 0) continue
        item = tx.create(PantryItem, {
          id: snapshot.id,
          household: householdId,
          foodKey: snapshot.foodKey,
          name: snapshot.name,
          createdAt: new Date(snapshot.createdAt),
        })
      }
      tx.assign(item, {
        name: snapshot.name,
        foodKey: snapshot.foodKey || keyOf(snapshot.name),
        quantity: snapshot.quantity,
        unit: snapshot.unit,
        amountText: snapshot.amountText,
        aisle: (snapshot.aisle && aisles.get(snapshot.aisle)) ?? null,
        storedIn: snapshot.storedIn,
        useBy: snapshot.useBy,
        forMeals: snapshot.forMeals,
      })
      restored.push(item)
    }
    await tx.flush()
    return describeItems(tx, householdId, restored)
  })
}
