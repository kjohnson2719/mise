import { z } from "@hono/zod-openapi"
import { DIETS, INGREDIENT_MARKS } from "@merran/shared"
import { RECIPE_ORIGINS } from "../../database/entities/index.ts"
import {
  COOK_NOTE,
  IDS,
  PAIR_OPTION,
  RECIPE,
  RECIPE_INPUT,
  RECIPE_SUMMARY,
  TIMES,
} from "./examples.ts"

const minutes = z.number().int().min(0).max(100_000).nullish()

const DietSchema = z.enum(DIETS).openapi("Diet")

/** The household's corrections to a recipe's diet labels: true adds one, false takes it away. */
const DietOverridesSchema = z
  .partialRecord(DietSchema, z.boolean())
  .openapi("DietOverrides")
const text = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .nullish()
    .transform((value) => value || null)

/**
 * A recipe as the editor and the API write it. Ingredients and steps are
 * lines, one each; a line starting with "#" starts a section.
 */
export const RecipeInputSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Give the recipe a name.")
      .max(200, "Keep the name under 200 characters."),
    description: text(2000, "Keep it under 2,000 characters."),
    servings: z
      .number()
      .positive("Use a number above 0.")
      .max(1000, "Use 1,000 or fewer.")
      .nullish()
      .transform((value) => value ?? null),
    yieldText: text(100, "Keep it under 100 characters.").openapi({
      description: 'What it makes, when that isn\'t servings: "2 loaves".',
    }),
    prepMinutes: minutes.transform((value) => value ?? null),
    cookMinutes: minutes.transform((value) => value ?? null),
    totalMinutes: minutes.transform((value) => value ?? null),
    notes: text(5000, "Keep the notes under 5,000 characters."),
    sourceUrl: z
      .union([
        z.url({
          protocol: /^https?$/,
          error: "Use a full link, starting with https://",
        }),
        z.literal(""),
      ])
      .nullish()
      .transform((value) => value || null),
    rating: z
      .number()
      .int()
      .min(1)
      .max(5)
      .nullish()
      .transform((value) => value ?? null),
    tags: z
      .array(z.string().trim().min(1).max(40, "Keep tags under 40 characters."))
      .max(30, "Use 30 tags or fewer.")
      .default([]),
    ingredients: z
      .array(z.string().max(500, "Keep each line under 500 characters."))
      .max(300, "Use 300 lines or fewer.")
      .default([])
      .openapi({ example: ["# Dough", "2 cups flour", "1 tsp salt"] }),
    steps: z
      .array(z.string().max(5000, "Keep each step under 5,000 characters."))
      .max(200, "Use 200 steps or fewer.")
      .default([]),
  })
  .openapi("RecipeInput", { example: RECIPE_INPUT })

export type RecipeInput = z.output<typeof RecipeInputSchema>

export const RecipeSummarySchema = z
  .object({
    id: z.string(),
    slug: z.string().openapi({ example: "lemon-chicken" }),
    name: z.string(),
    description: z.string().nullable(),
    servings: z.number().nullable(),
    totalMinutes: z.number().nullable().openapi({
      description: "As given, or prep and cook added up.",
    }),
    rating: z.number().nullable(),
    tags: z.array(z.string()),
    diets: z.array(DietSchema).openapi({
      description:
        "Diet labels worked out from the ingredients, with the household's corrections.",
    }),
    photo: z
      .object({
        full: z.string().openapi({ description: "For the recipe page." }),
        card: z.string().openapi({ description: "Cropped, for recipe cards." }),
      })
      .nullable()
      .openapi({
        description:
          "Where its photo is, in each size, or null. The links change with the photo, so they can be kept.",
      }),
    lastMadeAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .openapi("RecipeSummary", { example: RECIPE_SUMMARY })

export const IngredientSchema = z
  .object({
    id: z.string(),
    section: z.string().nullable(),
    text: z.string().openapi({ description: "The line as written." }),
    quantity: z.number().nullable(),
    quantityMax: z.number().nullable(),
    unit: z.string().nullable().openapi({ example: "tablespoon" }),
    food: z.string().nullable(),
    note: z.string().nullable(),
    mark: z.enum(INGREDIENT_MARKS).nullable().openapi({
      description:
        "What it is to the dish, as tidy up marked it: needed, swappable or optional. A dislike is left out of lines that aren't needed. None until marked.",
    }),
  })
  .openapi("Ingredient", { example: RECIPE.ingredients[1] })

export const StepSchema = z
  .object({
    id: z.string(),
    section: z.string().nullable(),
    text: z.string(),
  })
  .openapi("Step", { example: RECIPE.steps[0] })

export const NutritionSchema = z
  .object({
    source: z.enum(["site", "calculated", "estimate"]).openapi({
      description:
        "From the recipe's site, worked out from USDA's data, or estimated by AI.",
    }),
    calories: z.number().optional().openapi({ description: "kcal." }),
    protein: z.number().optional().openapi({ description: "Grams." }),
    carbs: z.number().optional().openapi({ description: "Grams." }),
    fat: z.number().optional().openapi({ description: "Grams." }),
    fiber: z.number().optional().openapi({ description: "Grams." }),
    sugar: z.number().optional().openapi({ description: "Grams." }),
    sodium: z.number().optional().openapi({ description: "Milligrams." }),
    missing: z.array(z.string()).optional().openapi({
      description: "Ingredient lines that couldn't be counted.",
    }),
    servings: z.number().optional().openapi({
      description: "The servings it's for; it rescales when they change.",
    }),
  })
  .openapi("Nutrition", {
    description: "Per serving; what isn't known is left out.",
    example: {
      source: "calculated",
      calories: 412,
      protein: 31.5,
      carbs: 12.2,
      fat: 26.1,
      fiber: 2.4,
      sugar: 3.1,
      sodium: 640,
      missing: ["1 bay leaf"],
      servings: 4,
    },
  })

export const RecipeSchema = RecipeSummarySchema.extend({
  origin: z.enum(RECIPE_ORIGINS),
  photoByAi: z.boolean().openapi({
    description:
      "Its photo was made by AI, in the household's style. Making another replaces it; a real one always does.",
  }),
  sourceUrl: z.string().nullable(),
  yieldText: z.string().nullable(),
  prepMinutes: z.number().nullable(),
  cookMinutes: z.number().nullable(),
  notes: z.string().nullable(),
  dietOverrides: DietOverridesSchema.openapi({
    description:
      "Where the household corrected the labels the ingredients suggest.",
  }),
  needs: z.array(z.string()).openapi({
    description:
      "Foods the household said it can't do without: a dislike that's usually left out of recipes rules this one out instead.",
  }),
  nutrition: NutritionSchema.nullable().openapi({
    description: "Per serving, when it's known.",
  }),
  ingredients: z.array(IngredientSchema),
  steps: z.array(StepSchema),
}).openapi("Recipe", { example: RECIPE })

export const RECIPE_SORTS = [
  "newest",
  "name",
  "updated",
  "rating",
  "made",
] as const

export const RecipeListQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .max(200)
    .optional()
    .openapi({ description: "Words in the name, description or ingredients." }),
  tag: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) => (value === undefined ? [] : [value].flat()))
    .openapi({
      description: "Only recipes with this tag. Repeat it for all of several.",
    }),
  diet: z
    .union([DietSchema, z.array(DietSchema)])
    .optional()
    .transform((value) => (value === undefined ? [] : [value].flat()))
    .openapi({
      description:
        "Only recipes with this diet label. Repeat it for all of several.",
    }),
  maxMinutes: z.coerce.number().int().min(1).max(100_000).optional().openapi({
    description: "Only recipes ready in this many minutes or fewer.",
  }),
  new: z.stringbool().optional().openapi({
    description: "Only recipes not made yet (true), or only ones made (false).",
  }),
  onSale: z.stringbool().optional().openapi({
    description:
      "Only recipes that use a real deal at the household's store (true), from `GET /stores/deals`.",
  }),
  sort: z.enum(RECIPE_SORTS).default("newest").openapi({
    description:
      "Newest added, name, recently changed, top rated, or recently made.",
  }),
  limit: z.coerce.number().int().min(1).max(100).default(48),
  offset: z.coerce.number().int().min(0).default(0),
})

export const RecipeListSchema = z
  .object({
    recipes: z.array(RecipeSummarySchema),
    total: z.number().openapi({ description: "How many match, in all." }),
  })
  .openapi("RecipeList", { example: { recipes: [RECIPE_SUMMARY], total: 1 } })

export const RecipeParam = z.object({
  recipe: z.string().openapi({
    param: { name: "recipe", in: "path" },
    description: "The recipe's id, or its slug.",
    example: "lemon-chicken",
  }),
})

export const CookNoteSchema = z
  .object({
    id: z.string(),
    rating: z.number().nullable().openapi({ description: "1 to 5 stars." }),
    note: z.string().nullable().openapi({ description: "For next time." }),
    by: z
      .string()
      .nullable()
      .openapi({ description: "Who cooked it, if they're still here." }),
    createdAt: z.iso.datetime(),
  })
  .openapi("CookNote", { example: COOK_NOTE })

export const AddedCookNoteSchema = CookNoteSchema.extend({
  suggesting: z.boolean().openapi({
    description:
      "Its note is being turned into a suggested change to the recipe, which will wait in the Review queue.",
  }),
}).openapi("AddedCookNote", { example: { ...COOK_NOTE, suggesting: true } })

export const CookNoteInputSchema = z
  .object({
    rating: z
      .number()
      .int()
      .min(1)
      .max(5)
      .nullish()
      .transform((value) => value ?? null)
      .openapi({
        description: "1 to 5 stars. They become the recipe's rating.",
      }),
    note: z
      .string()
      .trim()
      .max(1000, "Keep the note under 1,000 characters.")
      .nullish()
      .transform((value) => value || null)
      .openapi({ description: "Anything to change next time." }),
  })
  .refine((input) => input.rating !== null || input.note !== null, {
    message: "Give it stars, a note, or both.",
  })
  .openapi("CookNoteInput", {
    example: { rating: 5, note: "More lemon next time." },
  })
export type CookNoteInput = z.infer<typeof CookNoteInputSchema>

export const CookNoteParam = RecipeParam.extend({
  noteId: z.string().openapi({ param: { name: "noteId", in: "path" } }),
})

export const NeedsInputSchema = z
  .object({
    foods: z
      .array(z.string().trim().min(1, "Name the food.").max(60))
      .max(50)
      .openapi({
        description:
          "Foods it can't do without, replacing any said before. An empty list lets every dislike be left out again.",
      }),
    canLeaveOut: z
      .array(z.string().trim().min(1, "Name the food.").max(60))
      .max(50)
      .optional()
      .openapi({
        description:
          "Foods tidy up marked as needed that it can do without after all: their lines are marked optional.",
      }),
  })
  .openapi("NeedsInput", {
    description:
      "For example, a stir fry that's nothing without its mushrooms: someone who doesn't like them can't just leave them out.",
    example: { foods: ["mushrooms"] },
  })

export const DietsInputSchema = z
  .object({
    overrides: DietOverridesSchema.openapi({
      description:
        "The labels as they should be, where they differ from the ingredients. An empty object goes back to what the ingredients say.",
    }),
  })
  .openapi("DietsInput", {
    description:
      "For example, not gluten-free after all, because the household's stock has wheat in it.",
    example: { overrides: { "gluten-free": false } },
  })

export const PairOptionSchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    photo: z
      .string()
      .nullable()
      .openapi({ description: "Its card-sized photo, or null." }),
    servings: z.number().nullable(),
    totalMinutes: z.number().nullable(),
  })
  .openapi("PairOption", { example: PAIR_OPTION })

const RECIPE_PAIRING = {
  id: IDS.pairing,
  kind: "recipe" as const,
  recipe: PAIR_OPTION,
}

export const PairingSchema = z
  .discriminatedUnion("kind", [
    z.object({
      id: z.string(),
      kind: z.literal("recipe"),
      recipe: PairOptionSchema,
    }),
    z.object({
      id: z.string(),
      kind: z.literal("tag"),
      tag: z.string().openapi({ description: "Every recipe with this tag." }),
    }),
  ])
  .openapi("Pairing", { example: RECIPE_PAIRING })

export const RecipePairingsSchema = z
  .object({
    pairings: z
      .array(PairingSchema)
      .openapi({ description: "What it goes with, as set." }),
    options: z.array(PairOptionSchema).openapi({
      description:
        "Every recipe that adds up to: picked ones first, then tagged ones by name.",
    }),
    pairsWith: z.array(PairOptionSchema).openapi({
      description: "Recipes it's offered with: the other way round.",
    }),
  })
  .openapi("RecipePairings", {
    example: {
      pairings: [
        RECIPE_PAIRING,
        { id: IDS.tagPairing, kind: "tag", tag: "salad" },
      ],
      options: [PAIR_OPTION],
      pairsWith: [],
    },
  })

export const PairingsInputSchema = z
  .object({
    recipes: z
      .array(z.string())
      .max(100, "Pick 100 recipes or fewer.")
      .optional()
      .openapi({ description: "Recipes it goes with, by id or slug." }),
    tag: z.string().trim().min(1).max(40).optional().openapi({
      description: "Or every recipe with this tag, now and later.",
    }),
  })
  .refine((input) => (input.recipes?.length ?? 0) > 0 || input.tag, {
    message: "Pick a recipe or a tag.",
  })
  .openapi("PairingsInput", { example: { recipes: ["garlic-rice"] } })
export type PairingsInput = z.infer<typeof PairingsInputSchema>

export const PairingParam = RecipeParam.extend({
  pairingId: z.string().openapi({ param: { name: "pairingId", in: "path" } }),
})

/** Recipes picked in select mode, by id. */
const BulkIds = z
  .array(z.uuid())
  .min(1, "Pick something first.")
  .max(500, "Up to 500 at a time.")

const BulkTags = z
  .array(z.string().trim().min(1).max(40, "Keep tags under 40 characters."))
  .min(1, "Name a tag.")
  .max(20, "Up to 20 tags at a time.")

export const RecipeBulkInputSchema = z
  .discriminatedUnion("action", [
    z.object({ action: z.literal("delete"), ids: BulkIds }).openapi({
      description: "To Recently deleted, for 30 days.",
    }),
    z.object({ action: z.literal("addTags"), ids: BulkIds, tags: BulkTags }),
    z.object({
      action: z.literal("removeTags"),
      ids: BulkIds,
      tags: BulkTags,
    }),
  ])
  .openapi("RecipeBulkInput", {
    example: {
      action: "addTags",
      ids: [IDS.lemonChicken, IDS.garlicRice],
      tags: ["weeknight"],
    },
  })
export type RecipeBulkInput = z.infer<typeof RecipeBulkInputSchema>

export const DeletedBulkInputSchema = z
  .discriminatedUnion("action", [
    z.object({ action: z.literal("restore"), ids: BulkIds }).openapi({
      description: "Back where they were.",
    }),
    z.object({ action: z.literal("purge"), ids: BulkIds }).openapi({
      description: "Gone for good, photos and all.",
    }),
  ])
  .openapi("DeletedBulkInput", {
    example: { action: "restore", ids: [IDS.lemonChicken] },
  })
export type DeletedBulkInput = z.infer<typeof DeletedBulkInputSchema>

export const BulkResultSchema = z
  .object({
    changed: z.number().openapi({
      description:
        "How many it changed. Ones not there, or already that way, are skipped.",
    }),
  })
  .openapi("BulkResult", { example: { changed: 2 } })

export const RatingInputSchema = z
  .object({
    rating: z.number().int().min(1).max(5).nullable().openapi({
      description: "From 1 to 5 stars, or null to clear it.",
    }),
  })
  .openapi("RecipeRatingInput", { example: { rating: 4 } })

export const VersionSchema = z
  .object({
    id: z.string(),
    source: z.enum(["import", "edit", "tidy", "assistant", "swap", "restore"]),
    name: z.string().openapi({ description: "The recipe's name then." }),
    createdBy: z.string().nullable(),
    createdAt: z.iso.datetime(),
  })
  .openapi("RecipeVersion", {
    example: {
      id: IDS.version,
      source: "edit",
      name: "Lemon Chicken",
      createdBy: "Sam Rivera",
      createdAt: TIMES.created,
    },
  })

export const VersionParam = RecipeParam.extend({
  versionId: z.string().openapi({ param: { name: "versionId", in: "path" } }),
})

export const DeletedRecipeSchema = RecipeSummarySchema.extend({
  deletedAt: z.iso.datetime(),
  goneAt: z.iso
    .datetime()
    .openapi({ description: "When it's deleted for good." }),
}).openapi("DeletedRecipe", {
  example: {
    ...RECIPE_SUMMARY,
    deletedAt: TIMES.now,
    goneAt: "2026-11-14T18:30:00.000Z",
  },
})

export const DeletedRecipeParam = z.object({
  recipeId: z.string().openapi({ param: { name: "recipeId", in: "path" } }),
})

export const TagSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    recipes: z.number().openapi({ description: "How many recipes have it." }),
  })
  .openapi("Tag", { example: { id: IDS.tag, name: "weeknight", recipes: 12 } })

export const TagParam = z.object({
  tagId: z.string().openapi({ param: { name: "tagId", in: "path" } }),
})

export const TagChangesSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Give the tag a name.")
      .max(40, "Keep tags under 40 characters.")
      .openapi({
        description: "A name another tag already has merges the two.",
      }),
  })
  .openapi("TagChanges", { example: { name: "Weeknight" } })

export const ImportResultSchema = z
  .object({
    recipe: RecipeSchema,
    duplicate: z.boolean().openapi({
      description:
        "True when the link was imported before: this is that recipe, unchanged.",
    }),
  })
  .openapi("ImportResult", { example: { recipe: RECIPE, duplicate: false } })
