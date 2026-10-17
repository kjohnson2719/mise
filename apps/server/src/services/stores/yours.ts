import { STORES_BY_KEY, storeSearch } from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import {
  Household,
  ShoppingItem,
  StoreConnection,
  StoreProduct,
} from "../../database/entities/index.ts"
import { STORE_SETTINGS } from "../../modules/stores/settings.ts"
import { findList } from "../list/lists.ts"
import { amountOf, foodOf } from "./basket.ts"
import { KROGER, krogerConnection, type StoreDeps } from "./connections.ts"
import { krogerApp } from "./kroger.ts"

// The stores a household shops at (docs/platform.md, Stores): its Kroger
// store and Walmart, which Merran can send to, and the stores it picked
// in Settings, which Find searches. And Send's plan for a list: which of
// those stores each thing on it is picked at.

const WALMART = "walmart"

/** A store the household shops at, as Find and Send offer it. */
export type YourStore = {
  key: string
  /** As the household knows it: "Fry's" for its Kroger store. */
  name: string
  /** Merran can find its products and send to its cart. */
  connected: boolean
  /** Its site can be searched, in the household's country. */
  searchable: boolean
}

/**
 * The household's stores: its Kroger store when it has one, Walmart when
 * the server has it on (in the US), then the ones it picked.
 */
export async function yourStores(
  deps: Pick<StoreDeps, "settings">,
  em: EntityManager,
  householdId: string
): Promise<YourStore[]> {
  const household = await em.findOneOrFail(Household, { id: householdId })
  const country = household.country ?? null
  const searchable = (key: string) => storeSearch(key, country, "milk") !== null
  const stores: YourStore[] = []
  const kroger = await krogerConnection(em)
  if (kroger?.location && (await krogerApp(deps.settings))) {
    stores.push({
      key: KROGER,
      name: kroger.location.banner,
      connected: true,
      searchable: true,
    })
  }
  if (
    (await deps.settings.server(STORE_SETTINGS.walmart)) &&
    (!country || country.toUpperCase() === "US")
  ) {
    stores.push({
      key: WALMART,
      name: "Walmart",
      connected: true,
      searchable: true,
    })
  }
  const picked = await deps.settings.household(
    em,
    householdId,
    STORE_SETTINGS.yours
  )
  for (const key of picked ?? []) {
    const store = STORES_BY_KEY.get(key)
    if (!store || stores.some((one) => one.key === key)) continue
    stores.push({
      key,
      name: store.name,
      connected: false,
      searchable: searchable(key),
    })
  }
  return stores
}

/**
 * Send's plan for a list: the stores it can send to, and for each thing
 * left on it, the stores the household picked a product at for its food
 * (picked by someone, or sent there before; Merran's own picks don't
 * count), newest first, and the stores it's already been sent to.
 */
export async function sendPlan(
  deps: Pick<StoreDeps, "settings">,
  em: EntityManager,
  householdId: string,
  listId: string
) {
  const list = await findList(em, listId)
  const stores = (await yourStores(deps, em, householdId)).filter(
    (store) => store.connected
  )
  const keys = stores.map((store) => store.key)
  const items = await em.find(
    ShoppingItem,
    { list: list.id, checked: false },
    { orderBy: { createdAt: "asc", id: "asc" } }
  )
  const foods = [...new Set(items.map(foodOf))]
  const picks =
    keys.length > 0 && foods.length > 0
      ? await em.find(
          StoreProduct,
          { store: { $in: keys }, food: { $in: foods }, chosen: true },
          { orderBy: { updatedAt: "desc" } }
        )
      : []
  const sent = new Map(
    (await em.find(StoreConnection, { store: { $in: keys } })).map(
      (connection) => [
        connection.store,
        new Set(Object.keys(connection.lastSent?.items ?? {})),
      ]
    )
  )
  return {
    stores: stores.map(({ key, name }) => ({ key, name })),
    items: items.map((item) => ({
      itemId: item.id,
      name: item.name,
      amount: amountOf(item),
      picked: picks
        .filter((pick) => pick.food === foodOf(item))
        .map((pick) => pick.store),
      sent: keys.filter((key) => sent.get(key)?.has(item.id)),
    })),
  }
}
