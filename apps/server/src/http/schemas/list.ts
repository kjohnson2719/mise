import { z } from "@hono/zod-openapi"
import { ITEM_SOURCES, MEALS } from "../../database/entities/index.ts"
import { IDS, TIMES } from "./examples.ts"

// The shopping lists: what to buy, by aisle, on whichever list the
// household sorts it onto; from the plan, typed in, or every week.

const Day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a day written like "2026-10-15".')
  .openapi({ example: "2026-10-15" })

const SourceSchema = z.enum(ITEM_SOURCES).openapi("ListItemSource", {
  description:
    "How it got on the list: from the plan, typed in, every week, a usual buy, or the assistant.",
})

const share = z.object({
  meal: z.string(),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
})

const ITEM = {
  id: IDS.listItems[0],
  list: IDS.shoppingList,
  name: "chicken thighs",
  amount: "3 lb",
  quantity: 3,
  unit: "pound",
  amountText: null,
  aisle: IDS.aisles[1],
  checked: false,
  source: "plan" as const,
  meals: [{ id: IDS.planEntry, name: "Lemon Chicken" }],
  createdAt: TIMES.now,
}

const SNAPSHOT = {
  id: IDS.listItems[0],
  list: IDS.shoppingList,
  name: "chicken thighs",
  foodKey: "chicken thigh",
  quantity: 3,
  unit: "pound",
  amountText: null,
  aisle: IDS.aisles[1],
  checked: false,
  source: "plan" as const,
  forMeals: [{ meal: IDS.planEntry, quantity: 3, unit: "pound" }],
  createdAt: TIMES.now,
}

export const ListItemSchema = z
  .object({
    id: z.string(),
    list: z.string().openapi({ description: "The list it's on." }),
    name: z.string(),
    amount: z.string().openapi({
      description: 'How much, as it shows: "1 ½ cups", "half a bag", or empty.',
    }),
    quantity: z.number().nullable(),
    unit: z.string().nullable().openapi({
      description: 'A unit id, like "cup" or "pound"; null for a count.',
    }),
    amountText: z.string().nullable().openapi({
      description:
        'An amount in words ("half a bag"), when it isn\'t a number.',
    }),
    aisle: z.string().nullable().openapi({ description: "Its aisle's id." }),
    checked: z.boolean(),
    source: SourceSchema,
    meals: z
      .array(z.object({ id: z.string(), name: z.string() }))
      .openapi({ description: "The planned meals it's for." }),
    createdAt: z.iso.datetime(),
  })
  .openapi("ListItem", { example: ITEM })

const AisleSchema = z
  .object({ id: z.string(), name: z.string(), position: z.number().int() })
  .openapi("Aisle")

const LISTS = [
  {
    id: IDS.shoppingList,
    name: "Shopping list",
    main: true,
    aisles: [],
  },
  {
    id: IDS.costcoList,
    name: "Costco",
    main: false,
    aisles: [IDS.aisles[1]],
  },
]

const ListSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    main: z.boolean().openapi({
      description: "The main list, which takes what no other list does.",
    }),
    aisles: z.array(z.string()).openapi({
      description: "The ids of the aisles that go on it.",
    }),
  })
  .openapi("List")

export const ShoppingListSchema = z
  .object({
    lists: z.array(ListSchema).openapi({
      description: "The household's lists, the main one first.",
    }),
    aisles: z.array(AisleSchema).openapi({
      description:
        "In a walk through the store, the household's country's to start.",
    }),
    items: z.array(ListItemSchema).openapi({
      description: "By aisle, in the aisles' order, oldest first in each.",
    }),
  })
  .openapi("ShoppingList", {
    example: {
      lists: LISTS,
      aisles: [
        { id: IDS.aisles[0], name: "Produce", position: 0 },
        { id: IDS.aisles[1], name: "Meat & seafood", position: 1 },
        { id: IDS.aisles[2], name: "Other", position: 2 },
      ],
      items: [
        {
          ...ITEM,
          id: IDS.listItems[1],
          name: "lemons",
          amount: "2",
          quantity: 2,
          unit: null,
          aisle: IDS.aisles[0],
        },
        { ...ITEM, list: IDS.costcoList },
      ],
    },
  })

export const ListsInputSchema = z
  .object({
    lists: z
      .array(
        z.object({
          id: z.string().nullish().openapi({
            description: "An existing list's id; none for a new one.",
          }),
          name: z.string().trim().min(1, "Name the list.").max(40),
          aisles: z.array(z.string()).max(40),
        })
      )
      .min(1)
      .max(10),
  })
  .openapi("ListsInput", {
    example: {
      lists: [
        { id: IDS.shoppingList, name: "Groceries", aisles: [] },
        { name: "Costco", aisles: [IDS.aisles[1]] },
      ],
    },
  })

export const ListsSchema = z
  .object({ lists: z.array(ListSchema) })
  .openapi("Lists", { example: { lists: LISTS } })

export const ItemParam = z.object({
  itemId: z.string().openapi({
    param: { name: "itemId", in: "path" },
    example: IDS.listItems[0],
  }),
})

export const NewListItemSchema = z
  .object({
    text: z
      .string()
      .trim()
      .min(1, "Say what to add.")
      .max(200)
      .openapi({ description: '"2 lb ground beef", or just "paper towels".' }),
    aisle: z.string().nullish().openapi({
      description: "An aisle's id; the food's usual aisle when left out.",
    }),
    list: z.string().nullish().openapi({
      description: "A list's id; the food's usual list when left out.",
    }),
  })
  .openapi("NewListItem", { example: { text: "2 lb ground beef" } })

export const ListItemChangesSchema = z
  .object({
    name: z.string().trim().min(1, "Name it.").max(200),
    amount: z.string().max(60).openapi({
      description: '"2 lb", "half a bag", or empty for none.',
    }),
    checked: z.boolean(),
    aisle: z.string().nullable().openapi({
      description:
        "An aisle's id, or null. The household's remembered for the food: next time it goes there.",
    }),
    list: z.string().openapi({
      description:
        "Another list's id. Remembered for the food too: next time it goes on that list.",
    }),
  })
  .partial()
  .openapi("ListItemChanges", { example: { checked: true } })

export const ListItemSnapshotSchema = z
  .object({
    id: z.string(),
    list: z.string(),
    name: z.string().min(1).max(200),
    foodKey: z.string().max(200).nullable(),
    quantity: z.number().nullable(),
    unit: z.string().max(40).nullable(),
    amountText: z.string().max(60).nullable(),
    aisle: z.string().nullable(),
    checked: z.boolean(),
    source: SourceSchema,
    forMeals: z.array(share).max(100).nullable(),
    createdAt: z.iso.datetime(),
  })
  .openapi("ListItemSnapshot", {
    description: "An item as it was, to put it back (Undo).",
    example: SNAPSHOT,
  })

export const ListBulkSchema = z
  .object({
    ids: z.array(z.string()).min(1).max(500),
    action: z.enum([
      "remove",
      "check",
      "uncheck",
      "aisle",
      "move",
      "every-week",
    ]),
    aisle: z.string().nullish().openapi({
      description: "For aisle: the aisle's id, or null for none.",
    }),
    list: z.string().optional().openapi({
      description: "For move: the list's id.",
    }),
  })
  .refine((bulk) => bulk.action !== "aisle" || bulk.aisle !== undefined, {
    message: "Say which aisle.",
    path: ["aisle"],
  })
  .refine((bulk) => bulk.action !== "move" || bulk.list !== undefined, {
    message: "Say which list.",
    path: ["list"],
  })
  .openapi("ListBulk", {
    example: { ids: [IDS.listItems[0], IDS.listItems[1]], action: "check" },
  })

export const ListBeforeSchema = z
  .object({ before: z.array(ListItemSnapshotSchema) })
  .openapi("ListBefore", {
    description: "What the items were before, for Undo with /list/restore.",
    example: { before: [SNAPSHOT] },
  })

export const ListBulkResultSchema = z
  .object({
    changed: z.number().int(),
    before: z.array(ListItemSnapshotSchema),
  })
  .openapi("ListBulkResult", { example: { changed: 1, before: [SNAPSHOT] } })

export const ClearListSchema = z
  .object({
    which: z.enum(["checked", "all"]).openapi({
      description: "What's checked off, or everything.",
    }),
  })
  .openapi("ClearList", { example: { which: "checked" } })

export const ListRestoreSchema = z
  .object({ items: z.array(ListItemSnapshotSchema).min(1).max(500) })
  .openapi("ListRestore", { example: { items: [SNAPSHOT] } })

export const ListItemsSchema = z
  .object({ items: z.array(ListItemSchema) })
  .openapi("ListItems", { example: { items: [ITEM] } })

export const FromPlanQuery = z.object({
  from: Day.optional().openapi({ param: { name: "from", in: "query" } }),
  to: Day.optional().openapi({ param: { name: "to", in: "query" } }),
})

export const FromPlanSchema = z
  .object({ from: Day, to: Day })
  .openapi("FromPlan", { example: { from: "2026-10-12", to: "2026-10-18" } })

export const FromPlanPreviewSchema = z
  .object({
    meals: z
      .array(
        z.object({
          id: z.string(),
          date: Day,
          anyDay: z.boolean(),
          meal: z.enum(MEALS),
          name: z.string(),
        })
      )
      .openapi({ description: "Planned meals not on the list yet." }),
    listed: z
      .number()
      .int()
      .openapi({ description: "How many are on the list already." }),
  })
  .openapi("FromPlanPreview", {
    example: {
      meals: [
        {
          id: IDS.planEntry,
          date: "2026-10-15",
          anyDay: false,
          meal: "dinner",
          name: "Lemon Chicken",
        },
      ],
      listed: 2,
    },
  })

export const FromPlanResultSchema = z
  .object({
    meals: z.number().int().openapi({ description: "Meals added." }),
    added: z.number().int().openapi({ description: "New lines on the list." }),
    merged: z
      .number()
      .int()
      .openapi({ description: "Lines added to ones already there." }),
    everyWeek: z
      .number()
      .int()
      .openapi({ description: "Every-week items added." }),
    onHand: z.array(z.string()).openapi({
      description: "Left off: always on hand.",
    }),
    inPantry: z.array(z.string()).openapi({
      description: "Left off: at home already, and now set aside for them.",
    }),
  })
  .openapi("FromPlanResult", {
    example: {
      meals: 3,
      added: 14,
      merged: 2,
      everyWeek: 2,
      onHand: ["salt", "black pepper"],
      inPantry: ["rice"],
    },
  })

const EVERY_WEEK = {
  id: IDS.everyWeek,
  name: "Bananas",
  amount: "1 bunch",
  aisle: IDS.aisles[0],
}

export const EveryWeekItemSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    amount: z.string().nullable(),
    aisle: z.string().nullable(),
  })
  .openapi("EveryWeekItem", { example: EVERY_WEEK })

export const EveryWeekSchema = z
  .object({ items: z.array(EveryWeekItemSchema) })
  .openapi("EveryWeek", { example: { items: [EVERY_WEEK] } })

export const NewEveryWeekItemSchema = z
  .object({
    name: z.string().trim().min(1, "Name it.").max(200),
    amount: z.string().max(60).nullish(),
  })
  .openapi("NewEveryWeekItem", {
    example: { name: "Bananas", amount: "1 bunch" },
  })

export const EveryWeekChangesSchema = z
  .object({
    name: z.string().trim().min(1, "Name it.").max(200),
    amount: z.string().max(60).nullable(),
  })
  .partial()
  .openapi("EveryWeekChanges", { example: { amount: "2 bunches" } })

export const EveryWeekParam = z.object({
  weeklyId: z.string().openapi({
    param: { name: "weeklyId", in: "path" },
    example: IDS.everyWeek,
  }),
})

export const OnHandSchema = z
  .object({
    items: z.array(z.string().trim().max(60)).max(100).openapi({
      description:
        'Left off lists made from the plan. Each covers its kinds: "salt" is kosher and sea salt too.',
    }),
  })
  .openapi("OnHand", {
    example: { items: ["salt", "pepper", "water", "ice", "olive oil"] },
  })

// Usual buys.

const USUAL = {
  food: "milk",
  name: "milk",
  amount: "1 gal",
  every: 6,
  lastBought: "2026-10-09",
  dueOn: "2026-10-14",
}

export const UsualBuysSchema = z
  .object({
    items: z
      .array(
        z.object({
          food: z.string().openapi({ description: "Which food it is." }),
          name: z.string(),
          amount: z.string().openapi({
            description: "How much it was last time, or empty.",
          }),
          every: z.number().int().openapi({
            description: "About how many days apart it's bought.",
          }),
          lastBought: Day,
          dueOn: Day,
        })
      )
      .openapi({ description: "Due now, most overdue first." }),
  })
  .openapi("UsualBuys", { example: { items: [USUAL] } })

export const UsualSkipSchema = z
  .object({ food: z.string().min(1).max(200) })
  .openapi("UsualSkip", { example: { food: "milk" } })

export const UsualAddSchema = z
  .object({ foods: z.array(z.string().min(1).max(200)).min(1).max(50) })
  .openapi("UsualAdd", { example: { foods: ["milk"] } })

export const SameAsSchema = z
  .object({
    item: z.string().min(1).openapi({
      description: "The other thing on the list it's the same food as.",
      example: IDS.listItems[1],
    }),
  })
  .openapi("SameAs", { example: { item: IDS.listItems[1]! } })

export const SameAsResultSchema = z
  .object({
    food: z.string().openapi({
      description: "The food both are now, for the household.",
      example: "butter",
    }),
    joined: z.number().int().openapi({
      description: "How many lines joined into others.",
      example: 1,
    }),
  })
  .openapi("SameAsResult", { example: { food: "butter", joined: 1 } })

export const JoinedNamesSchema = z
  .object({
    names: z.array(z.string()).openapi({
      description:
        "The names this line was joined from: its own, and its meals' lines that came to the same food.",
      example: ["butter", "unsalted butter"],
    }),
  })
  .openapi("JoinedNames", { example: { names: ["butter", "unsalted butter"] } })

export const KeepApartSchema = z
  .object({ names: z.array(z.string().trim().min(1).max(200)).min(1).max(50) })
  .openapi("KeepApart", { example: { names: ["unsalted butter"] } })

export const KeptApartSchema = z
  .object({ kept: z.number().int() })
  .openapi("KeptApart", { example: { kept: 1 } })

const FOOD_ALIAS = {
  id: IDS.listItems[2]!,
  name: "unsalted butter",
  food: "unsalted butter",
  apart: true,
}

export const FoodAliasSchema = z
  .object({
    id: z.string(),
    name: z.string().openapi({
      description:
        "A food's key made another's (Same as…), or a name kept its own (Not the same).",
    }),
    food: z
      .string()
      .openapi({ description: "The food it is, for the household." }),
    apart: z.boolean().openapi({ description: "Kept its own food." }),
  })
  .openapi("FoodAlias", { example: FOOD_ALIAS })

export const FoodAliasesSchema = z
  .object({ aliases: z.array(FoodAliasSchema) })
  .openapi("FoodAliases", { example: { aliases: [FOOD_ALIAS] } })

export const AliasParam = z.object({
  aliasId: z.string().openapi({
    param: { name: "aliasId", in: "path" },
    example: IDS.listItems[2],
  }),
})
