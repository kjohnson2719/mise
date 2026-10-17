import { z } from "@hono/zod-openapi"
import { COURSES } from "../../services/sites/data.ts"
import { DiscoverySchema } from "./discover.ts"
import { IDS, TIMES } from "./examples.ts"

const SHELF_RECIPE = {
  id: IDS.siteRecipe,
  url: "https://www.recipetineats.com/honey-garlic-chicken/",
  name: "Honey Garlic Chicken",
  site: "RecipeTin Eats",
  description: "Juicy chicken in a sticky honey garlic sauce, in 12 minutes.",
  minutes: 12,
  courses: ["main"],
  photo: `/api/sites/recipes/${IDS.siteRecipe}/photo`,
  publishedAt: TIMES.created,
  inLibrary: null,
  suits: true,
}

const IN_LIBRARY = {
  ...SHELF_RECIPE,
  id: IDS.otherSiteRecipe,
  url: "https://www.recipetineats.com/lemon-chicken/",
  name: "Lemon Chicken",
  description: null,
  minutes: 35,
  inLibrary: { slug: "lemon-chicken", name: "Lemon Chicken" },
}

export const ShelfRecipeSchema = z
  .object({
    id: z.string(),
    url: z.string().openapi({
      description: "The recipe's page, to import at `POST /recipes/import`.",
    }),
    name: z.string(),
    site: z.string(),
    description: z.string().nullable().openapi({
      description:
        "The recipe's own short description, when the site gives one.",
    }),
    minutes: z.number().nullable(),
    courses: z.array(z.enum(COURSES)).openapi({
      description:
        "What its site says it is, in Merran's words; empty when it doesn't say.",
    }),
    photo: z.string().nullable().openapi({
      description: "A small copy of its photo, through Merran.",
    }),
    publishedAt: z.iso.datetime().nullable(),
    inLibrary: z
      .object({ slug: z.string(), name: z.string() })
      .nullable()
      .openapi({
        description: "The household's recipe from it, if it has one.",
      }),
    suits: z.boolean().openapi({
      description:
        "False when it has a food the household avoids, or is off its diets.",
    }),
  })
  .openapi("ShelfRecipe", { example: SHELF_RECIPE })

const FOLLOWED = {
  id: IDS.followedSite,
  name: "RecipeTin Eats",
  url: "https://www.recipetineats.com/",
  feedUrl: "https://www.recipetineats.com/feed/",
  recipes: [SHELF_RECIPE, IN_LIBRARY],
  waiting: 3,
  reading: false,
  readAt: TIMES.now,
  error: null,
  followedAt: TIMES.created,
}

export const FollowedSiteSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    url: z.string(),
    feedUrl: z.string(),
    recipes: z.array(ShelfRecipeSchema).openapi({
      description:
        "Its newest recipes, newest first: posts Merran opened and can import.",
    }),
    waiting: z.number().openapi({
      description:
        "New posts not opened yet: Merran opens them a few seconds apart.",
    }),
    reading: z.boolean().openapi({
      description: "Not read for the first time yet.",
    }),
    readAt: z.iso.datetime().nullable(),
    error: z.string().nullable().openapi({
      description: "Why its feed couldn't be read last time.",
    }),
    followedAt: z.iso.datetime(),
  })
  .openapi("FollowedSite", { example: FOLLOWED })

const SUGGESTION = {
  name: "Love and Lemons",
  url: "https://www.loveandlemons.com/",
  description: "Bright, seasonal vegetarian cooking.",
}

export const SiteListSchema = z
  .object({
    sites: z.array(FollowedSiteSchema),
    suggestions: z
      .array(
        z.object({
          name: z.string(),
          url: z.string().openapi({ description: "Follow it with this." }),
          description: z.string(),
        })
      )
      .openapi({
        description: "Sites that work well with Merran, not followed yet.",
      }),
  })
  .openapi("SiteList", {
    example: { sites: [FOLLOWED], suggestions: [SUGGESTION] },
  })

export const FollowSiteSchema = z
  .object({
    url: z
      .string()
      .trim()
      .min(3, "Paste the site's address.")
      .max(500, "That address is too long.")
      .openapi({
        description: "Any page of the site, its feed, or a suggestion's `url`.",
      }),
  })
  .openapi("FollowSite", { example: { url: "https://www.loveandlemons.com/" } })

export const SiteRecipesSchema = z
  .object({ recipes: z.array(ShelfRecipeSchema) })
  .openapi("SiteRecipes", { example: { recipes: [SHELF_RECIPE, IN_LIBRARY] } })

export const SiteParam = z.object({
  site: z.string().openapi({
    param: { name: "site", in: "path" },
    example: IDS.followedSite,
  }),
})

export const ShelfRecipeParam = z.object({
  recipe: z.string().openapi({
    param: { name: "recipe", in: "path" },
    example: IDS.siteRecipe,
  }),
})

const SUMMARY = {
  id: "weeknight",
  title: "Weeknight wins",
  description: "Dinners on the table in 40 minutes or less.",
  theme: "Weeknight dinners on the table in 40 minutes or less",
  count: 2,
  toImport: 1,
  photos: [`/api/sites/recipes/${IDS.siteRecipe}/photo`],
}

const summaryShape = {
  id: z.string(),
  title: z.string(),
  description: z.string(),
  theme: z.string().openapi({ description: "What Find more looks for." }),
  count: z.number(),
  toImport: z
    .number()
    .openapi({ description: "How many aren't in the library yet." }),
  photos: z
    .array(z.string())
    .openapi({ description: "Up to four, for its card." }),
}

export const CollectionListSchema = z
  .object({
    collections: z.array(
      z.object(summaryShape).openapi("CollectionSummary", { example: SUMMARY })
    ),
  })
  .openapi("CollectionList", { example: { collections: [SUMMARY] } })

export const CollectionSchema = z
  .object({
    ...summaryShape,
    recipes: z.array(ShelfRecipeSchema).openapi({
      description:
        "Up to 24 that suit the household, those not in its library first: the sites' newest that fit, its hand-picked classics, then the rest.",
    }),
    // A union, as .nullable() would make every Discovery nullable.
    found: z.union([DiscoverySchema, z.null()]).openapi({
      description: "What Find more found for it last, or is finding.",
    }),
  })
  .openapi("Collection", {
    example: { ...SUMMARY, recipes: [SHELF_RECIPE, IN_LIBRARY], found: null },
  })

export const CollectionParam = z.object({
  collection: z.string().openapi({
    param: { name: "collection", in: "path" },
    example: "weeknight",
  }),
})
