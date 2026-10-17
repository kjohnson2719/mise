import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { householdFilter } from "../scope.ts"
import { createdAt, id, updatedAt } from "./base.ts"
import { householdRef } from "./households.ts"
import { Secret } from "./secrets.ts"
import { User } from "./users.ts"

/** How a store's orders are collected: picked up, or brought to the door. */
export const STORE_MODALITIES = ["PICKUP", "DELIVERY"] as const

/** The store a household shops at, as Kroger knows it. */
export type StoreLocation = {
  locationId: string
  name: string
  /** "Fry's", "Ralphs": Kroger's own name for the chain. */
  banner: string
  /** The banner's site, for products and the cart: "frysfood.com". */
  domain: string
  address: string
}

/** What was last sent to the cart: by list item, how many. */
export type LastSent = { at: string; items: Record<string, number> }

/**
 * A household's connection to a store with an API (Kroger): the store it
 * shops at, and the account whose cart things are sent to, linked by one
 * of the household. Its tokens are sealed in a secret.
 */
export const StoreConnection = defineEntity({
  name: "StoreConnection",
  tableName: "store_connections",
  properties: {
    id: id(),
    household: () => householdRef(),
    /** "kroger" */
    store: p.string(),
    location: p.json<StoreLocation>().nullable(),
    modality: p.enum(STORE_MODALITIES).default("PICKUP"),
    /** The linked account's tokens, sealed. */
    account: () => p.manyToOne(Secret).ref().nullable().deleteRule("set null"),
    accessExpiresAt: p.datetime().nullable(),
    linkedBy: () => p.manyToOne(User).ref().nullable().deleteRule("set null"),
    linkedAt: p.datetime().nullable(),
    /** The store stopped taking the account's tokens: link it again. */
    broken: p.boolean().default(false),
    /** A link being made: its state and PKCE verifier, whose, until when. */
    pendingState: p.string().nullable().index(),
    pendingVerifier: p.text().nullable(),
    pendingUser: () =>
      p.manyToOne(User).ref().nullable().deleteRule("set null"),
    pendingUntil: p.datetime().nullable(),
    lastSent: p.json<LastSent>().nullable(),
    /** When its prices and sales were last checked. */
    pricesCheckedAt: p.datetime().nullable(),
    /**
     * When each recipe food was last looked up at the store, by food key:
     * so the daily check spreads its searches out.
     */
    priceSearches: p.json<Record<string, string>>().nullable(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  uniques: [{ properties: ["household", "store"] }],
  filters: householdFilter,
})
export type StoreConnection = InferEntity<typeof StoreConnection>
