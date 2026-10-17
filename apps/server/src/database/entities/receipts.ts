import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { householdFilter } from "../scope.ts"
import { createdAt, day, id } from "./base.ts"
import { householdRef } from "./households.ts"
import { User } from "./users.ts"

/** What a receipt line is: food goes in the pantry, the rest doesn't. */
export const RECEIPT_KINDS = ["food", "household", "other"] as const
export type ReceiptKind = (typeof RECEIPT_KINDS)[number]

/** A line from a receipt, as Merran read it. */
export type ReceiptLine = {
  id: string
  /** As printed: "GV WHL MLK 1GAL". */
  text: string
  /** What it is: "whole milk". */
  name: string
  /** "1 gal", "2 lb", or null. */
  amount: string | null
  price: number | null
  kind: ReceiptKind
  /** The shopping list item it was bought for, taken off when it's added. */
  listItem: { id: string; name: string } | null
}

/** A photo or PDF of the receipt, kept to compare with while looking it over. */
export type ReceiptFile = { mediaType: "image/jpeg" | "application/pdf" }

/**
 * A receipt read and waiting for a look before anything goes in the
 * pantry. Gone once it's added or discarded, or after a day.
 */
export const Receipt = defineEntity({
  name: "Receipt",
  tableName: "receipts",
  properties: {
    id: id(),
    household: () => householdRef(),
    user: () => p.manyToOne(User).ref().nullable().deleteRule("set null"),
    store: p.string().nullable(),
    /** The day on the receipt. */
    date: day().nullable(),
    total: p.double().nullable(),
    lines: p.json<ReceiptLine[]>(),
    files: p.json<ReceiptFile[]>(),
    createdAt: createdAt(),
  },
  indexes: [{ properties: ["household", "createdAt"] }],
  filters: householdFilter,
})
export type Receipt = InferEntity<typeof Receipt>
