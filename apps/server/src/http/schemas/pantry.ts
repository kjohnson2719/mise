import { z } from "@hono/zod-openapi"
import { PLAN_STATUSES, STORAGE_PLACES } from "../../database/entities/index.ts"
import { IDS, TIMES } from "./examples.ts"

// What's at home: the fridge, the freezer and the cupboard.

const Day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a day written like "2026-10-15".')
  .openapi({ example: "2026-10-20" })

const StoredInSchema = z.enum(STORAGE_PLACES).openapi("StoredIn", {
  description: "Where it's kept.",
})

const UseSoonSchema = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("past"), date: Day }),
    z.object({ kind: z.literal("soon"), date: Day }),
    z.object({ kind: z.literal("leftover") }),
  ])
  .openapi("UseSoon", {
    description:
      "Why to use it soon: its use-by date has gone (`past`) or is close (`soon`), or it's fresh food bought for meals that were skipped or went by uncooked (`leftover`).",
  })

const ITEM = {
  id: IDS.pantryItems[0],
  name: "chicken thighs",
  amount: "2 lb",
  quantity: 2,
  unit: "pound",
  amountText: null,
  storedIn: "fridge" as const,
  aisle: IDS.aisles[1],
  useBy: "2026-10-18",
  meals: [
    {
      id: IDS.planEntry,
      name: "Lemon Chicken",
      date: "2026-10-17",
      status: "planned" as const,
    },
  ],
  useSoon: { kind: "soon" as const, date: "2026-10-18" },
  createdAt: TIMES.now,
}

const SNAPSHOT = {
  id: IDS.pantryItems[0],
  name: "chicken thighs",
  foodKey: "chicken thigh",
  quantity: 2,
  unit: "pound",
  amountText: null,
  aisle: IDS.aisles[1],
  storedIn: "fridge" as const,
  useBy: "2026-10-18",
  forMeals: [{ meal: IDS.planEntry, quantity: 2, unit: "pound" }],
  createdAt: TIMES.now,
}

export const PantryItemSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    amount: z.string().openapi({
      description:
        'How much, as it shows: "2 lb", "half a bag", or empty for just "have it".',
    }),
    quantity: z.number().nullable(),
    unit: z.string().nullable(),
    amountText: z.string().nullable(),
    storedIn: StoredInSchema.nullable(),
    aisle: z.string().nullable(),
    useBy: Day.nullable(),
    meals: z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          date: Day,
          status: z.enum(PLAN_STATUSES),
        })
      )
      .openapi({ description: "The planned meals it's set aside for." }),
    useSoon: UseSoonSchema.nullable(),
    createdAt: z.iso.datetime(),
  })
  .openapi("PantryItem", { example: ITEM })

export const PantrySchema = z
  .object({
    items: z.array(PantryItemSchema).openapi({
      description:
        "The fridge, the freezer, then the cupboard; by aisle in each.",
    }),
  })
  .openapi("Pantry", {
    example: {
      items: [
        ITEM,
        {
          ...ITEM,
          id: IDS.pantryItems[1],
          name: "rice",
          amount: "",
          quantity: null,
          unit: null,
          storedIn: "cupboard" as const,
          aisle: IDS.aisles[2],
          useBy: null,
          meals: [],
          useSoon: null,
        },
      ],
    },
  })

export const PantryItemParam = z.object({
  itemId: z.string().openapi({
    param: { name: "itemId", in: "path" },
    example: IDS.pantryItems[0],
  }),
})

export const NewPantryItemSchema = z
  .object({
    text: z
      .string()
      .trim()
      .min(1, "Say what to add.")
      .max(200)
      .openapi({ description: '"2 cans black beans", or just "rice".' }),
    storedIn: StoredInSchema.nullish().openapi({
      description: "Where it's kept; a guess from the food when left out.",
    }),
  })
  .openapi("NewPantryItem", { example: { text: "2 cans black beans" } })

export const PantryChangesSchema = z
  .object({
    name: z.string().trim().min(1, "Name it.").max(200),
    amount: z.string().max(60).openapi({
      description: '"2 lb", "half a bag", or empty for just "have it".',
    }),
    storedIn: StoredInSchema.nullable(),
    useBy: Day.nullable(),
    aisle: z.string().nullable(),
  })
  .partial()
  .openapi("PantryChanges", { example: { storedIn: "freezer" } })

export const PantrySnapshotSchema = z
  .object({
    id: z.string(),
    name: z.string().min(1).max(200),
    foodKey: z.string().max(200),
    quantity: z.number().nullable(),
    unit: z.string().max(40).nullable(),
    amountText: z.string().max(60).nullable(),
    aisle: z.string().nullable(),
    storedIn: StoredInSchema.nullable(),
    useBy: Day.nullable(),
    forMeals: z
      .array(
        z.object({
          meal: z.string(),
          quantity: z.number().nullable(),
          unit: z.string().nullable(),
        })
      )
      .max(100)
      .nullable(),
    createdAt: z.iso.datetime(),
  })
  .openapi("PantrySnapshot", {
    description: "Something at home as it was, to put it back (Undo).",
    example: SNAPSHOT,
  })

export const PantryBulkSchema = z
  .object({
    ids: z.array(z.string()).min(1).max(500),
    action: z.enum(["remove", "storedIn", "useBy"]),
    storedIn: StoredInSchema.nullish(),
    useBy: Day.nullish(),
  })
  .refine((bulk) => bulk.action !== "storedIn" || bulk.storedIn !== undefined, {
    message: "Say where it's kept.",
    path: ["storedIn"],
  })
  .refine((bulk) => bulk.action !== "useBy" || bulk.useBy !== undefined, {
    message: "Say the use-by date, or null for none.",
    path: ["useBy"],
  })
  .openapi("PantryBulk", {
    example: {
      ids: [IDS.pantryItems[0]],
      action: "storedIn",
      storedIn: "freezer",
    },
  })

export const PantryBulkResultSchema = z
  .object({
    changed: z.number().int(),
    before: z.array(PantrySnapshotSchema),
  })
  .openapi("PantryBulkResult", { example: { changed: 1, before: [SNAPSHOT] } })

export const PantryBeforeSchema = z
  .object({ before: z.array(PantrySnapshotSchema) })
  .openapi("PantryBefore", {
    description: "What was there before, for Undo with /pantry/restore.",
    example: { before: [SNAPSHOT] },
  })

export const PantryRestoreSchema = z
  .object({ items: z.array(PantrySnapshotSchema).min(1).max(500) })
  .openapi("PantryRestore", { example: { items: [SNAPSHOT] } })

export const PantryItemsSchema = z
  .object({ items: z.array(PantryItemSchema) })
  .openapi("PantryItems", { example: { items: [ITEM] } })

export const PutAwaySchema = z
  .object({
    list: z.string().nullish().openapi({
      description:
        "A list's id: only what's checked off on it. Every list when left out.",
    }),
  })
  .openapi("PutAway", { example: {} })

export const PutAwayResultSchema = z
  .object({
    stored: z.number().int().openapi({ description: "Things now at home." }),
    cleared: z.number().int().openapi({
      description:
        "Things cleared without going in: household things and what's always on hand.",
    }),
  })
  .openapi("PutAwayResult", { example: { stored: 12, cleared: 2 } })
