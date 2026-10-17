import { load, type CheerioAPI } from "cheerio"
import type { Nutrition } from "../../../database/entities/index.ts"
import type { RecipeInput } from "../../../http/schemas/recipes.ts"

// Most recipe sites describe their recipe in the page as schema.org Recipe
// data (JSON-LD), for search engines. This reads it.

/* eslint-disable @typescript-eslint/no-explicit-any -- JSON-LD is untyped by nature */

export type RecipeData = {
  input: RecipeInput
  /** What the site says is in a serving, when it says. */
  nutrition: Nutrition | null
  /** Photos to try, best first: the recipe's own, then the page's share image. */
  photoUrls: string[]
  /** What the page says the recipe is, for sorting it into starter collections. */
  about?: RecipeAbout
}

/** A recipe's categories, cuisines and keywords, as the page gives them. */
export type RecipeAbout = {
  categories: string[]
  cuisines: string[]
  keywords: string[]
}

/** schema.org's names for what Merran shows. */
const SITE_NUTRIENTS = {
  calories: "calories",
  protein: "proteinContent",
  carbs: "carbohydrateContent",
  fat: "fatContent",
  fiber: "fiberContent",
  sugar: "sugarContent",
  sodium: "sodiumContent",
} as const

/**
 * A serving's nutrition from a recipe's NutritionInformation: "250
 * calories", "12 g", "300 mg". Null when it has none of it.
 */
export function siteNutrition(raw: unknown): Nutrition | null {
  const node = Array.isArray(raw) ? raw[0] : raw
  if (!node || typeof node !== "object") return null
  const values = node as Record<string, unknown>
  const nutrition: Nutrition = { source: "site" }
  let any = false
  for (const [key, name] of Object.entries(SITE_NUTRIENTS)) {
    const text = cleanText(values[name])
    const match =
      /(\d+(?:[.,]\d+)?)\s*(kcal|cal|calories|mg|g|grams?)?\b/i.exec(text)
    if (!match) continue
    let amount = Number(match[1]!.replace(",", "."))
    const unit = match[2]?.toLowerCase()
    // Sodium in grams, now and then; Merran keeps milligrams.
    if (key === "sodium" && (unit === "g" || unit?.startsWith("gram"))) {
      amount *= 1000
    }
    if (key !== "sodium" && unit === "mg") amount /= 1000
    if (!Number.isFinite(amount) || amount < 0 || amount > 100_000) continue
    nutrition[key as keyof typeof SITE_NUTRIENTS] =
      key === "calories" || key === "sodium"
        ? Math.round(amount)
        : Math.round(amount * 10) / 10
    any = true
  }
  return any ? nutrition : null
}

/** Decodes HTML entities, drops tags and collapses whitespace. */
export function cleanText(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") return ""
  const text = String(value)
  const decoded = /[<&]/.test(text)
    ? load(`<div>${text}</div>`)("div").text()
    : text
  return decoded.replace(/\s+/g, " ").trim()
}

function asArray(value: unknown): any[] {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
}

function isRecipe(node: any) {
  return asArray(node?.["@type"]).some(
    (type) => typeof type === "string" && type.toLowerCase().endsWith("recipe")
  )
}

/** Finds the Recipe anywhere in parsed JSON-LD: arrays, @graph, mainEntity. */
export function findRecipeNode(data: any, depth = 0): any {
  if (!data || typeof data !== "object" || depth > 6) return null
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findRecipeNode(item, depth + 1)
      if (found) return found
    }
    return null
  }
  if (isRecipe(data)) return data
  for (const key of [
    "@graph",
    "mainEntity",
    "mainEntityOfPage",
    "itemListElement",
  ]) {
    const found = findRecipeNode(data[key], depth + 1)
    if (found) return found
  }
  return null
}

/** "PT1H30M" is 90. Copes with "P0DT0H20M" and plain numbers too. */
export function parseDuration(value: unknown): number | null {
  if (typeof value === "number") return value > 0 ? Math.round(value) : null
  if (typeof value !== "string") return null
  const match = value
    .trim()
    .match(
      /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i
    )
  if (!match) return null
  const [, days, hours, minutes, seconds] = match.map((part) =>
    Number(part ?? 0)
  )
  const total = days! * 1440 + hours! * 60 + minutes! + seconds! / 60
  return total > 0 ? Math.round(total) : null
}

/**
 * "4 servings" is 4 servings; "2 loaves" is also kept as what it makes.
 * A leading "Makes" or "Yield:" goes, since the page labels it "Makes".
 */
export function parseYield(value: unknown) {
  const texts = asArray(value)
    .map((item) => cleanText(item).replace(/^(?:makes|yields?)\b:?\s*/i, ""))
    .filter(Boolean)
  let servings: number | null = null
  let yieldText: string | null = null
  for (const text of texts) {
    const number = text.match(/\d+(?:\.\d+)?/)
    if (number && servings === null) servings = Number(number[0])
    const words = text
      .replace(/[\d.\s-]+/g, " ")
      .trim()
      .toLowerCase()
    if (
      words &&
      !/^(servings?|serves|people|persons?|portions?)$/.test(words)
    ) {
      yieldText ??= text.slice(0, 100)
    }
  }
  return {
    servings: servings && servings > 0 && servings <= 1000 ? servings : null,
    yieldText,
  }
}

/**
 * Every object in the page's JSON-LD with an "@id", so a reference like
 * `"image": { "@id": "…#primaryimage" }` (common on WordPress sites) can be
 * followed to the ImageObject it points at.
 */
function indexIds(data: any, index = new Map<string, any>(), depth = 0) {
  if (!data || typeof data !== "object" || depth > 8) return index
  if (Array.isArray(data)) {
    for (const item of data) indexIds(item, index, depth + 1)
    return index
  }
  if (typeof data["@id"] === "string" && Object.keys(data).length > 1) {
    index.set(data["@id"], data)
  }
  for (const value of Object.values(data)) {
    if (value && typeof value === "object") indexIds(value, index, depth + 1)
  }
  return index
}

/**
 * Pixels in a photo, from its ImageObject or the size in its link
 * ("-1200x800.jpg", "/1500x0/", "?resize=500,375", "?w=1200"); 0 if unknown.
 */
function pixels(item: any, url: string) {
  const width = Number(item?.width?.value ?? item?.width)
  const height = Number(item?.height?.value ?? item?.height)
  if (width > 0 && height > 0) return width * height
  const link = url.replace(/%2C/gi, ",")
  const pair =
    link.match(/[-_/](\d{2,4})x(\d{1,4})(?:\.\w+(?:[?#]|$)|\/)/) ??
    link.match(/[?&](?:resize|fit|size)=(\d{2,4}),(\d{2,4})/)
  const w =
    Number(pair?.[1]) || Number(link.match(/[?&](?:w|width)=(\d{2,4})\b/)?.[1])
  const h =
    Number(pair?.[2]) || Number(link.match(/[?&](?:h|height)=(\d{2,4})\b/)?.[1])
  return w ? w * (h || w * 0.75) : 0
}

/** Big enough for the recipe page without looking soft. */
const BIG_PIXELS = 800 * 500

type Candidate = { url: string; size: number }

const RESIZE_PARAMS = ["resize", "fit", "size", "w", "h", "width", "height"]

/** A small copy's link without its resize settings, which image servers usually answer with the original. */
function original(url: string) {
  try {
    const link = new URL(url)
    const params = RESIZE_PARAMS.filter((key) => link.searchParams.has(key))
    if (params.length === 0) return null
    for (const key of params) link.searchParams.delete(key)
    return link.toString()
  } catch {
    return null
  }
}

/**
 * Best first: photos known to be big (biggest first), then ones of unknown
 * size in the page's order (often the originals), then known small ones.
 * A small copy's original is tried before the copy.
 */
function rankPhotos(found: Candidate[]) {
  const big = found
    .filter((f) => f.size >= BIG_PIXELS)
    .sort((a, b) => b.size - a.size)
  const small = found
    .filter((f) => f.size > 0 && f.size < BIG_PIXELS)
    .sort((a, b) => b.size - a.size)
  const unknown = [
    ...found.filter((f) => f.size === 0),
    ...small.flatMap((f) => {
      const url = original(f.url)
      return url ? [{ url, size: 0 }] : []
    }),
  ]
  return [...new Set([...big, ...unknown, ...small].map((f) => f.url))]
}

/** The recipe's photos as full links, with what's known of their size. */
function photoCandidates(
  value: unknown,
  ids: Map<string, any>,
  base: string
): Candidate[] {
  const found: Candidate[] = []
  for (const listed of asArray(value)) {
    const item =
      listed &&
      typeof listed === "object" &&
      typeof listed["@id"] === "string" &&
      !listed.url &&
      !listed.contentUrl
        ? (ids.get(listed["@id"]) ?? listed)
        : listed
    const raw =
      typeof item === "string" ? item : (item?.url ?? item?.contentUrl)
    for (const link of asArray(raw)) {
      if (typeof link !== "string" || !link.trim()) continue
      try {
        const url = new URL(link.trim(), base).toString()
        found.push({ url, size: pixels(item, url) })
      } catch {
        continue
      }
    }
  }
  return found
}

/** The page's share image (what a link preview shows), as a fallback photo. */
export function shareImages($: CheerioAPI, base: string) {
  const links = [
    $('meta[property="og:image"]').attr("content"),
    $('meta[property="og:image:url"]').attr("content"),
    $('meta[property="og:image:secure_url"]').attr("content"),
    $('meta[name="twitter:image"]').attr("content"),
    $('meta[name="twitter:image:src"]').attr("content"),
    $('link[rel="image_src"]').attr("href"),
  ]
  const urls: string[] = []
  for (const link of links) {
    if (!link?.trim()) continue
    try {
      urls.push(new URL(link.trim(), base).toString())
    } catch {
      // Not a usable link.
    }
  }
  return [...new Set(urls)]
}

/** Steps as editor lines, with "# Section" lines for HowToSections. */
function stepLines(value: unknown): string[] {
  const lines: string[] = []
  for (const item of asArray(value)) {
    if (typeof item === "string") {
      const text = /<li/i.test(item)
        ? load(item)("li")
            .toArray()
            .map((li) => load(li).text())
        : item.split(/\n+/)
      lines.push(...text.map(cleanText).filter(Boolean))
    } else if (item && typeof item === "object") {
      const type = asArray(item["@type"]).join(" ")
      if (/HowToSection/i.test(type) || (item.itemListElement && !item.text)) {
        const name = cleanText(item.name)
        if (name) lines.push(`# ${name}`)
        lines.push(...stepLines(item.itemListElement))
      } else {
        const text = cleanText(item.text ?? item.name ?? item.description)
        if (text) lines.push(text)
      }
    }
  }
  return lines
}

/** Categories some sites give that say nothing. */
const JUNK_TAGS = new Set(["recipe", "recipes", "food", "uncategorized"])

/**
 * Tags from the recipe's category and cuisine: "Main course", "Mexican".
 * Not its keywords, which are mostly for search engines (authors' names,
 * "easy pancakes", "flipping") and would swamp the household's own tags.
 * Several in one string ("breakfast, brunch") are split.
 */
function tagsFrom(node: any): string[] {
  const raw = [
    ...asArray(node.recipeCategory),
    ...asArray(node.recipeCuisine),
  ].flatMap((value) => cleanText(value).split(","))
  const seen = new Set<string>()
  const tags: string[] = []
  for (const value of raw) {
    const tag = value.trim()
    const key = tag.toLowerCase()
    if (tag && tag.length <= 30 && !seen.has(key) && !JUNK_TAGS.has(key)) {
      seen.add(key)
      tags.push(tag[0]!.toUpperCase() + tag.slice(1))
    }
  }
  return tags.slice(0, 5)
}

/** Words from a list, or one string of them split at commas, cleaned. */
function words(value: unknown) {
  return asArray(value)
    .flatMap((item) => cleanText(item).split(","))
    .map((word) => word.trim().toLowerCase())
    .filter((word) => word && word.length <= 60)
}

/** What the recipe is, by its categories, cuisines and keywords. */
function aboutFrom(node: any): RecipeAbout {
  return {
    categories: [...new Set(words(node.recipeCategory))].slice(0, 20),
    cuisines: [...new Set(words(node.recipeCuisine))].slice(0, 20),
    keywords: [...new Set(words(node.keywords))].slice(0, 40),
  }
}

/** Reads a page's schema.org Recipe, or null if it hasn't one. */
export function readRecipeData(
  html: string,
  pageUrl: string
): RecipeData | null {
  const $ = load(html)
  let node: any = null
  const blocks: unknown[] = []
  $('script[type="application/ld+json"]').each((_, element) => {
    const raw = $(element).text().trim()
    if (!raw) return
    let data: unknown
    try {
      data = JSON.parse(raw)
    } catch {
      // Some sites leave control characters or trailing commas in.
      try {
        data = JSON.parse(
          raw.replace(/[\u0000-\u001f]+/g, " ").replace(/,\s*([}\]])/g, "$1")
        )
      } catch {
        return
      }
    }
    blocks.push(data)
    node ??= findRecipeNode(data)
  })
  if (!node) return null

  const name = cleanText(node.name)
  const ingredients = asArray(node.recipeIngredient ?? node.ingredients)
    .map(cleanText)
    .filter(Boolean)
  const steps = stepLines(node.recipeInstructions)
  if (!name || (ingredients.length === 0 && steps.length === 0)) return null

  const { servings, yieldText } = parseYield(node.recipeYield)
  const nutrition = siteNutrition(node.nutrition)
  const description = cleanText(node.description)
  const prepMinutes = parseDuration(node.prepTime)
  const cookMinutes = parseDuration(node.cookTime)
  return {
    input: {
      name: name.slice(0, 200),
      description: description ? description.slice(0, 2000) : null,
      servings,
      yieldText,
      prepMinutes,
      cookMinutes,
      totalMinutes: parseDuration(node.totalTime),
      notes: null,
      sourceUrl: pageUrl,
      rating: null,
      tags: tagsFrom(node),
      ingredients: ingredients.slice(0, 300).map((line) => line.slice(0, 500)),
      steps: steps.slice(0, 200).map((line) => line.slice(0, 5000)),
    },
    nutrition: nutrition && servings ? { ...nutrition, servings } : nutrition,
    photoUrls: rankPhotos([
      ...photoCandidates(
        node.image ?? node.thumbnailUrl,
        indexIds(blocks),
        pageUrl
      ),
      ...shareImages($, pageUrl).map((url) => ({
        url,
        size: pixels(null, url),
      })),
    ]),
    about: aboutFrom(node),
  }
}
