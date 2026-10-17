import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { createdAt, id } from "./base.ts"
import { RecipeSite } from "./recipe_sites.ts"

/**
 * What a post is: found in a feed and not opened yet; a recipe Merran can
 * import; a page with no recipe on it (a roundup, a gear review); or one
 * that wouldn't open, or that `robots.txt` keeps Merran from.
 */
export const SITE_RECIPE_STATES = [
  "waiting",
  "recipe",
  "not-recipe",
  "failed",
] as const
export type SiteRecipeState = (typeof SITE_RECIPE_STATES)[number]

/**
 * A recipe page out on the web, as Merran read it: a post from a site's
 * feed, or a starter collection's classic. Public pages, read once for
 * every household (docs/platform.md, "Recipe sites and starter collections").
 */
export const SiteRecipe = defineEntity({
  name: "SiteRecipe",
  tableName: "site_recipes",
  properties: {
    id: id(),
    /** The site whose feed it came from; null for a classic from elsewhere. */
    site: () => p.manyToOne(RecipeSite).ref().nullable().deleteRule("cascade"),
    url: p.text().unique(),
    state: p.enum(SITE_RECIPE_STATES),
    /** What the site's called, as shown with the recipe. */
    siteName: p.string(),
    name: p.text().nullable(),
    /** The recipe's own short description, when it has one. */
    description: p.text().nullable(),
    minutes: p.integer().nullable(),
    /** Its photo on the site. */
    photoUrl: p.text().nullable(),
    /** The small copy Merran keeps of it, once fetched; "" when it wouldn't load. */
    photo: p.string().nullable(),
    /** Its courses, in Merran's words: "main", "dessert", "soup"... */
    courses: p.json<string[]>(),
    /** Its categories, cuisines and keywords, in lowercase. */
    keywords: p.json<string[]>(),
    ingredients: p.json<string[]>(),
    /** The diet labels its ingredients earn ("vegetarian"...). */
    diets: p.json<string[]>(),
    /** When the site posted it, from the feed. */
    publishedAt: p.datetime().nullable(),
    /** When it was last opened, and how many times in a row it wouldn't. */
    openedAt: p.datetime().nullable(),
    failures: p.integer().default(0),
    /** A starter collection's classic, opened again every week. */
    classic: p.boolean().default(false),
    createdAt: createdAt(),
  },
  indexes: [
    { properties: ["site", "state"] },
    { properties: ["state", "publishedAt"] },
  ],
})
export type SiteRecipe = InferEntity<typeof SiteRecipe>
