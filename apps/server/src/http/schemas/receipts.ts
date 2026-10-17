import { z } from "@hono/zod-openapi"
import { RECEIPT_KINDS } from "../../database/entities/index.ts"
import { IDS, TIMES } from "./examples.ts"

const LINE = {
  id: "0d1b5c2a9e44",
  text: "GV WHL MLK 1GAL",
  name: "whole milk",
  amount: "1 gal",
  price: 3.48,
  kind: "food",
  listItem: { id: IDS.listItems[0], name: "milk" },
} as const

const ReceiptLineSchema = z
  .object({
    id: z.string(),
    text: z.string().openapi({ description: "As printed." }),
    name: z.string().openapi({ description: "What it is, plainly." }),
    amount: z.string().nullable(),
    price: z.number().nullable(),
    kind: z.enum(RECEIPT_KINDS).openapi({
      description:
        "Food goes in the pantry; household things and the rest don't, unless they're picked.",
    }),
    listItem: z
      .object({ id: z.string(), name: z.string() })
      .nullable()
      .openapi({
        description:
          "The shopping list item it was bought for, taken off the list when it's added.",
      }),
  })
  .openapi("ReceiptLine", { example: LINE })

const RECEIPT = {
  id: IDS.receipt,
  store: "Walmart",
  date: "2026-10-14",
  total: 48.12,
  lines: [LINE],
  files: [
    {
      url: `/api/pantry/receipts/${IDS.receipt}/files/0`,
      mediaType: "image/jpeg",
    },
  ],
  createdAt: TIMES.now,
}

export const ReceiptSchema = z
  .object({
    id: z.string(),
    store: z.string().nullable(),
    date: z.string().nullable().openapi({ description: "The day on it." }),
    total: z.number().nullable(),
    lines: z.array(ReceiptLineSchema),
    files: z
      .array(
        z.object({
          url: z.string(),
          mediaType: z.enum(["image/jpeg", "application/pdf"]),
        })
      )
      .openapi({
        description: "The receipt's photos or PDF, to compare with.",
      }),
    createdAt: z.iso.datetime(),
  })
  .openapi("Receipt", { example: RECEIPT })

export const ReceiptListSchema = z
  .object({ receipts: z.array(ReceiptSchema) })
  .openapi("ReceiptList", { example: { receipts: [RECEIPT] } })

export const ReceiptParam = z.object({
  receiptId: z.string().openapi({
    param: { name: "receiptId", in: "path" },
    example: IDS.receipt,
  }),
})

export const ReceiptFileParam = ReceiptParam.extend({
  // Checked after who's asking, so a key without access hears that first.
  index: z
    .string()
    .openapi({ param: { name: "index", in: "path" }, example: "0" }),
})

export const AddReceiptInputSchema = z
  .object({
    items: z
      .array(
        z.object({
          id: z.string().min(1).max(40),
          name: z.string().trim().min(1, "Name it.").max(200),
          amount: z.string().trim().max(60).nullable(),
        })
      )
      .min(1, "Pick something to add.")
      .max(300),
  })
  .openapi("AddReceiptInput", {
    example: { items: [{ id: LINE.id, name: "whole milk", amount: "1 gal" }] },
  })

export const ReceiptAddedSchema = z
  .object({
    added: z.number().int(),
    offTheList: z
      .number()
      .int()
      .openapi({ description: "Shopping list items taken off with them." }),
  })
  .openapi("ReceiptAdded", { example: { added: 12, offTheList: 4 } })
