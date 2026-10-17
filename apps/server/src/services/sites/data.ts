import { readdirSync, readFileSync } from "node:fs"
import { DIETS } from "@merran/shared"
import { z } from "zod"

// Starter collections and suggested sites come as data files, one folder
// per language (data/en/collections.json, data/en/sites.json), so adding
// one is a pull request, not code. See data/README.md.

/** Merran's words for what a recipe is, from the categories sites give. */
export const COURSES = [
  "main",
  "side",
  "soup",
  "salad",
  "dessert",
  "baking",
  "breakfast",
  "snack",
  "drink",
  "sauce",
] as const
export type Course = (typeof COURSES)[number]

export const SEASONS = ["spring", "summer", "autumn", "winter"] as const
export type Season = (typeof SEASONS)[number]

const Word = z.string().trim().min(2).max(40)

/**
 * Which recipes a collection takes. `courses` and `words` are either-or (a
 * soup by its course, or "chowder" in its name); everything else must
 * hold too.
 */
export const CollectionRule = z
  .object({
    courses: z.array(z.enum(COURSES)).min(1).optional(),
    /** In its name, categories, cuisines or keywords, as whole words. */
    words: z.array(Word).min(1).optional(),
    /** None of these in its name or keywords. */
    without: z.array(Word).min(1).optional(),
    /** Merran's diet labels it must have. */
    diets: z.array(z.enum(DIETS)).min(1).optional(),
    maxMinutes: z.number().int().positive().optional(),
    /** Shown only in these seasons, which are six months apart in the south. */
    seasons: z.array(z.enum(SEASONS)).min(1).optional(),
    /** Shown only in these months, wherever the household is (1 is January). */
    months: z.array(z.number().int().min(1).max(12)).min(1).optional(),
  })
  .strict()
export type CollectionRule = z.infer<typeof CollectionRule>

export const CollectionData = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{2,40}$/),
    title: z.string().trim().min(2).max(60),
    description: z.string().trim().min(2).max(200),
    /** What Find more asks Discover for. */
    theme: z.string().trim().min(2).max(120),
    rule: CollectionRule,
    /** Hand-picked recipes it always has, each checked weekly. */
    classics: z.array(
      z.object({ url: z.url(), site: z.string().trim().min(1) }).strict()
    ),
  })
  .strict()
export type CollectionData = z.infer<typeof CollectionData>

export const SuggestedSite = z
  .object({
    name: z.string().trim().min(1).max(60),
    url: z.url(),
    feedUrl: z.url(),
    description: z.string().trim().min(2).max(200),
  })
  .strict()
export type SuggestedSite = z.infer<typeof SuggestedSite>

type LanguageData = {
  collections: CollectionData[]
  sites: SuggestedSite[]
}

const FOLDER = new URL("./data/", import.meta.url)

let loaded: Map<string, LanguageData> | null = null

/** Every language's collections and sites, read once and checked. */
export function siteData(): ReadonlyMap<string, LanguageData> {
  if (loaded) return loaded
  const languages = readdirSync(FOLDER, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
  loaded = new Map(
    languages.map((language) => {
      const read = (file: string) =>
        JSON.parse(
          readFileSync(new URL(`${language}/${file}`, FOLDER), "utf8")
        ) as unknown
      return [
        language,
        {
          collections: z.array(CollectionData).parse(read("collections.json")),
          sites: z.array(SuggestedSite).parse(read("sites.json")),
        },
      ]
    })
  )
  return loaded
}

/** One language's data, or English when there's none for it. */
export function dataFor(language: string) {
  const data = siteData()
  return data.get(language.split("-")[0]!.toLowerCase()) ?? data.get("en")!
}

/** Every suggested site, with its language. */
export function allSuggestedSites() {
  return [...siteData()].flatMap(([language, data]) =>
    data.sites.map((site) => ({ ...site, language }))
  )
}

/** Every classic in every language's collections, once each. */
export function allClassics() {
  const seen = new Map<string, string>()
  for (const data of siteData().values()) {
    for (const collection of data.collections) {
      for (const classic of collection.classics) {
        if (!seen.has(classic.url)) seen.set(classic.url, classic.site)
      }
    }
  }
  return [...seen].map(([url, site]) => ({ url, site }))
}
