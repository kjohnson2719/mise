import { z } from "@hono/zod-openapi"
import { AVOID_LEVELS, DIETS, THEME_KINDS } from "@merran/shared"
import { MEALS, PLAN_STATUSES } from "../../database/entities/index.ts"
import { IDS, TIMES } from "./examples.ts"

// The week plan: meals on days, and the week's pool for any day.

const Day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a day written like "2026-10-15".')
  .openapi({ example: "2026-10-15" })

const MealSchema = z.enum(MEALS).openapi("Meal")
const StatusSchema = z.enum(PLAN_STATUSES).openapi("PlanStatus")

const label = z.string().max(60)

/** Why a meal was picked: data, for the app to say in the reader's language. */
export const ReasonSchema = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("theme"), label }),
    z.object({ kind: z.literal("themeMissed"), label }),
    z.object({
      kind: z.literal("usesUp"),
      foods: z.array(z.string().max(60)).max(5),
    }),
    z.object({
      kind: z.literal("onSale"),
      foods: z.array(z.string().max(60)).max(5),
      lowest: z.boolean().openapi({
        description: "One is the lowest it's been in a while.",
      }),
    }),
    z.object({ kind: z.literal("new") }),
    z.object({ kind: z.literal("notLately"), weeks: z.number().int().min(0) }),
    z.object({
      kind: z.literal("rated"),
      stars: z.number().int().min(1).max(5),
    }),
    z.object({ kind: z.literal("quick"), minutes: z.number().int().min(0) }),
    z.object({
      kind: z.literal("leaveOut"),
      foods: z
        .array(
          z.object({ food: z.string().max(60), who: z.string().nullable() })
        )
        .max(20),
    }),
  ])
  .openapi("Reason", {
    description:
      "Why a meal was picked: the night's theme (\"Taco night\"), or one nothing fitted; food at home it uses up; food on sale at the household's store; never made; not had in so many weeks; rated so many stars; quick enough for a weeknight. And, after those, the foods to leave out of it for someone who doesn't like them.",
    example: { kind: "notLately", weeks: 5 },
  })

const why = z.array(ReasonSchema).max(5)

const PLAN_ENTRY = {
  id: IDS.planEntry,
  date: "2026-10-15",
  anyDay: false,
  meal: "dinner" as const,
  position: 0,
  status: "planned" as const,
  recipe: {
    id: IDS.lemonChicken,
    slug: "lemon-chicken",
    name: "Lemon Chicken",
    photo: null,
    servings: 4,
    totalMinutes: 50,
    calories: 412,
  },
  withRecipe: {
    id: IDS.garlicRice,
    slug: "garlic-rice",
    name: "Garlic Rice",
    calories: 210,
  },
  note: null,
  servings: null,
  why: [{ kind: "theme" as const, label: "Taco night" }],
  createdAt: TIMES.now,
}

const SNAPSHOT = {
  id: IDS.planEntry,
  date: "2026-10-15",
  anyDay: false,
  meal: "dinner" as const,
  position: 0,
  status: "planned" as const,
  recipe: IDS.lemonChicken,
  withRecipe: IDS.garlicRice,
  note: null,
  servings: null,
  listedAt: null,
  why: null,
  cookedAt: null,
}

export const PlanEntrySchema = z
  .object({
    id: z.string(),
    date: Day.openapi({
      description: "Its day, or for the week's pool, the week's first day.",
    }),
    anyDay: z.boolean().openapi({
      description: "In the week's pool: for any day of the week.",
    }),
    meal: MealSchema,
    position: z.number().int().openapi({
      description: "Its place among the meal's dishes.",
    }),
    status: StatusSchema,
    recipe: z
      .object({
        id: z.string(),
        slug: z.string(),
        name: z.string(),
        photo: z.string().nullable(),
        servings: z.number().nullable(),
        totalMinutes: z.number().int().nullable(),
        calories: z.number().nullable().openapi({
          description: "In a serving, when its nutrition is known.",
        }),
      })
      .nullable()
      .openapi({ description: "Null for a note." }),
    withRecipe: z
      .object({
        id: z.string(),
        slug: z.string(),
        name: z.string(),
        calories: z.number().nullable(),
      })
      .nullable()
      .openapi({ description: 'What it\'s made with: "with peanut sauce".' }),
    note: z
      .string()
      .nullable()
      .openapi({ description: 'A meal that isn\'t a recipe: "leftovers".' }),
    servings: z.number().nullable().openapi({
      description: "Null for the recipe's own servings.",
    }),
    why: why.openapi({
      description:
        "Why it was picked, when Fill the week picked it: none otherwise.",
    }),
    createdAt: z.iso.datetime(),
  })
  .openapi("PlanEntry", { example: PLAN_ENTRY })

export const PlanEntrySnapshotSchema = z
  .object({
    id: z.uuid(),
    date: Day,
    anyDay: z.boolean(),
    meal: MealSchema,
    position: z.number().int().min(0),
    status: StatusSchema,
    recipe: z.string().nullable(),
    withRecipe: z.string().nullable(),
    note: z.string().max(200).nullable(),
    servings: z.number().positive().max(1000).nullable(),
    listedAt: z.iso.datetime().nullable(),
    why: why.nullish().transform((value) => value ?? null),
    cookedAt: z.iso
      .datetime()
      .nullish()
      .openapi({
        description:
          "When it was marked cooked: put back cooked, its recipe and side were made then.",
      })
      .transform((value) => value ?? null),
  })
  .openapi("PlanEntrySnapshot", {
    description:
      "A meal as it was, to put back with /plan/restore: what taking it off or changing it answers with.",
    example: SNAPSHOT,
  })

export const PlanSchema = z
  .object({ entries: z.array(PlanEntrySchema) })
  .openapi("Plan", { example: { entries: [PLAN_ENTRY] } })

export const PlanQuerySchema = z.object({
  from: Day.optional().openapi({
    param: { name: "from", in: "query" },
    description: "The first day. This week's first day if left out.",
  }),
  to: Day.optional().openapi({
    param: { name: "to", in: "query" },
    description: "The last day. Six days after `from` if left out.",
  }),
})

const note = z
  .string()
  .trim()
  .min(1, "Write what the meal is.")
  .max(200, "Keep the note under 200 characters.")
const servings = z
  .number()
  .positive("Use a number above 0.")
  .max(1000, "Use 1,000 or fewer.")

export const NewPlanEntrySchema = z
  .object({
    date: Day,
    meal: MealSchema,
    anyDay: z.boolean().optional().openapi({
      description: "For the week's pool: any day of the week `date` is in.",
    }),
    recipe: z.string().nullish().openapi({
      description: "The recipe, by id or address. Or give a note instead.",
    }),
    withRecipe: z.string().nullish().openapi({
      description: "A side or sauce it's made with, by id or address.",
    }),
    note: note.nullish(),
    servings: servings.nullish(),
    why: why.nullish().openapi({
      description: "Why it was picked, as Fill the week said.",
    }),
  })
  .refine((entry) => !entry.recipe !== !entry.note, {
    message: "Give a recipe or a note.",
    path: ["recipe"],
  })
  .openapi("NewPlanEntry", {
    example: {
      date: "2026-10-15",
      meal: "dinner",
      recipe: "lemon-chicken",
      withRecipe: "garlic-rice",
    },
  })

export const PlanEntryChangesSchema = z
  .object({
    date: Day,
    meal: MealSchema,
    anyDay: z.boolean(),
    recipe: z.string().nullable().openapi({
      description:
        "Another recipe (Something else): it's planned afresh, its side kept.",
    }),
    withRecipe: z.string().nullable(),
    note: note.nullable(),
    servings: servings.nullable(),
    status: StatusSchema,
    why: why.nullable().openapi({
      description: "Why a new recipe was picked, as Something else said.",
    }),
  })
  .partial()
  .openapi("PlanEntryChanges", {
    example: { date: "2026-10-16", status: "planned" },
  })

export const PlanEntryParam = z.object({
  entryId: z.uuid().openapi({ param: { name: "entryId", in: "path" } }),
})

export const PlanBulkSchema = z
  .object({
    ids: z.array(z.uuid()).min(1).max(200),
    action: z.enum(["remove", "move", "status"]),
    date: Day.optional().openapi({ description: "Where to move them." }),
    meal: MealSchema.optional().openapi({
      description: "The meal to move them to; their own if left out.",
    }),
    anyDay: z.boolean().optional().openapi({
      description: "Into the pool of the week `date` is in.",
    }),
    status: StatusSchema.optional(),
  })
  .refine((bulk) => bulk.action !== "move" || bulk.date !== undefined, {
    message: "Say where to move them.",
    path: ["date"],
  })
  .refine((bulk) => bulk.action !== "status" || bulk.status !== undefined, {
    message: "Say what they are now.",
    path: ["status"],
  })
  .openapi("PlanBulk", {
    example: { ids: [IDS.planEntry], action: "status", status: "cooked" },
  })

export const PlanBulkResultSchema = z
  .object({
    entries: z.array(PlanEntrySchema).openapi({
      description: "The meals as they are now; none when they were taken off.",
    }),
    before: z.array(PlanEntrySnapshotSchema).openapi({
      description: "The meals as they were, for Undo.",
    }),
  })
  .openapi("PlanBulkResult", {
    example: {
      entries: [{ ...PLAN_ENTRY, status: "cooked" as const }],
      before: [SNAPSHOT],
    },
  })

export const PlanWeekSchema = z
  .object({ week: Day.openapi({ description: "The week's first day." }) })
  .openapi("PlanWeek", { example: { week: "2026-10-11" } })

export const PlanClearedSchema = z
  .object({
    before: z.array(PlanEntrySnapshotSchema).openapi({
      description: "The meals taken off, for Undo.",
    }),
  })
  .openapi("PlanCleared", { example: { before: [SNAPSHOT] } })

export const PlanRestoreSchema = z
  .object({ entries: z.array(PlanEntrySnapshotSchema).min(1).max(500) })
  .openapi("PlanRestore", { example: { entries: [SNAPSHOT] } })

export const WhatsNextSchema = z
  .object({
    today: Day.openapi({ description: "Today, in the household's time zone." }),
    mealNow: MealSchema.openapi({
      description: "The meal of the hour: breakfast until 11, lunch until 3.",
    }),
    entry: PlanEntrySchema.nullable().openapi({
      description: "The next meal still planned, or null for none ahead.",
    }),
  })
  .openapi("WhatsNext", {
    example: { today: "2026-10-15", mealNow: "dinner", entry: PLAN_ENTRY },
  })

// Fill the week.

const SlotSchema = z.object({ date: Day, meal: MealSchema })

export const SuggestRequestSchema = z
  .object({
    slots: z.array(SlotSchema).min(1).max(56),
    exclude: z.array(z.string()).max(200).optional().openapi({
      description:
        "Recipes not to suggest: ideas already showing, or ones passed over.",
    }),
  })
  .openapi("SuggestRequest", {
    example: {
      slots: [
        { date: "2026-10-15", meal: "dinner" },
        { date: "2026-10-16", meal: "dinner" },
      ],
    },
  })

const SUGGESTION = {
  date: "2026-10-15",
  meal: "dinner" as const,
  recipe: {
    id: IDS.lemonChicken,
    slug: "lemon-chicken",
    name: "Lemon Chicken",
    photo: null,
    servings: 4,
    totalMinutes: 50,
  },
  withRecipe: { id: IDS.garlicRice, slug: "garlic-rice", name: "Garlic Rice" },
  why: [
    { kind: "notLately" as const, weeks: 5 },
    { kind: "rated" as const, stars: 5 },
  ],
}

export const SuggestionsSchema = z
  .object({
    suggestions: z.array(
      z.object({
        date: Day,
        meal: MealSchema,
        recipe: z.object({
          id: z.string(),
          slug: z.string(),
          name: z.string(),
          photo: z.string().nullable(),
          servings: z.number().nullable(),
          totalMinutes: z.number().int().nullable(),
        }),
        withRecipe: z
          .object({ id: z.string(), slug: z.string(), name: z.string() })
          .nullable(),
        why,
      })
    ),
  })
  .openapi("Suggestions", { example: { suggestions: [SUGGESTION] } })

export const NewPlanEntriesSchema = z
  .object({ entries: z.array(NewPlanEntrySchema).min(1).max(56) })
  .openapi("NewPlanEntries", {
    example: {
      entries: [
        {
          date: "2026-10-15",
          meal: "dinner",
          recipe: IDS.lemonChicken,
          withRecipe: IDS.garlicRice,
          why: [{ kind: "notLately", weeks: 5 }],
        },
      ],
    },
  })

export const PlanEntriesSchema = z
  .object({ entries: z.array(PlanEntrySchema) })
  .openapi("PlanEntries", { example: { entries: [PLAN_ENTRY] } })

// Tastes and theme nights.

export const TastesSchema = z
  .object({
    avoid: z
      .array(
        z.object({
          food: z.string().trim().min(1, "Name the food.").max(60),
          level: z.enum(AVOID_LEVELS).openapi({
            description:
              "How firmly: an `allergy` or `never`, and recipes with it aren't suggested; `leave-out`, and they are, with it crossed off, unless it's what the dish is or the recipe needs it. Nuts, dairy, gluten, eggs and meat can't be left out, so they're saved as `never`.",
          }),
          who: z
            .string()
            .trim()
            .max(40)
            .nullish()
            .transform((value) => value || null)
            .openapi({
              description: "Who doesn't eat it, when it isn't everyone.",
            }),
        })
      )
      .max(100)
      .openapi({ description: "Foods the household doesn't eat." }),
    diets: z.array(z.enum(DIETS)).max(DIETS.length).openapi({
      description: "Diets every meal must fit.",
    }),
    weeknightMinutes: z.number().int().min(10).max(240).nullable().openapi({
      description: "The longest a dinner Monday to Thursday can take.",
    }),
  })
  .openapi("Tastes", {
    example: {
      avoid: [
        { food: "peanuts", level: "allergy", who: "Sam" },
        { food: "mushrooms", level: "leave-out", who: "Emma" },
      ],
      diets: [],
      weeknightMinutes: 45,
    },
  })

export const NightThemeSchema = z
  .object({
    kind: z.enum(THEME_KINDS),
    name: z.string().trim().min(1, "Name the theme.").max(30),
    tag: z.string().trim().min(1).max(40).optional(),
  })
  .refine((theme) => theme.kind !== "tag" || Boolean(theme.tag), {
    message: "A tag theme needs a tag.",
    path: ["tag"],
  })
  .openapi("NightTheme")

export const ThemeNightsSchema = z
  .object({
    themes: z.array(NightThemeSchema.nullable()).length(7).openapi({
      description: "Dinner's theme each weekday, Sunday first; null for none.",
    }),
  })
  .openapi("ThemeNights", {
    example: {
      themes: [
        null,
        null,
        { kind: "tag", name: "Tacos", tag: "taco" },
        null,
        null,
        { kind: "fish", name: "Fish" },
        { kind: "skip", name: "Eat out" },
      ],
    },
  })

// The weekly autoplan.

const AUTOPLAN_RUN = {
  week: "2026-10-19",
  at: "2026-10-17T16:00:00.000Z",
  planned: 6,
  empty: 7,
  listed: 18,
}

export const AutoplanRunSchema = z
  .object({
    week: Day.openapi({ description: "The first day of the week it planned." }),
    at: z.iso.datetime(),
    planned: z.number().int().openapi({ description: "Meals it filled." }),
    empty: z
      .number()
      .int()
      .openapi({ description: "Meals that were empty to fill." }),
    listed: z
      .number()
      .int()
      .openapi({ description: "Lines it put on the list, new or added to." }),
  })
  .openapi("AutoplanRun", { example: AUTOPLAN_RUN })

const autoplanSettings = {
  enabled: z.boolean(),
  day: z.number().int().min(0).max(6).openapi({
    description: "The day it runs, 0 for Sunday, in the household's time zone.",
  }),
  hour: z.number().int().min(0).max(23).openapi({
    description: "The hour it runs, 0 to 23, in the household's time zone.",
  }),
  meals: z.array(MealSchema).min(1, "Pick a meal to fill.").max(4).openapi({
    description: "The meals it fills, of those the household plans.",
  }),
  addToList: z.boolean().openapi({
    description: "Whether it puts what the week needs on the list too.",
  }),
}

export const AutoplanSettingsSchema = z
  .object(autoplanSettings)
  .openapi("AutoplanSettings", {
    example: {
      enabled: true,
      day: 6,
      hour: 9,
      meals: ["dinner"],
      addToList: true,
    },
  })

export const AutoplanSchema = z
  .object({
    ...autoplanSettings,
    next: z.iso.datetime().nullable().openapi({
      description: "When it runs next; none while it's off.",
    }),
    // A union, as AutoplanRunSchema.nullable() would make every run nullable.
    last: z
      .union([AutoplanRunSchema, z.null()])
      .openapi({ description: "What it did last." }),
  })
  .openapi("Autoplan", {
    example: {
      enabled: true,
      day: 6,
      hour: 9,
      meals: ["dinner"],
      addToList: true,
      next: "2026-10-24T16:00:00.000Z",
      last: AUTOPLAN_RUN,
    },
  })
