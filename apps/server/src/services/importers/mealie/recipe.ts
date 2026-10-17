import { formatQuantity } from "@merran/shared"
import type { Nutrition } from "../../../database/entities/index.ts"
import { cleanText, parseYield } from "../../recipes/import/recipe-data.ts"
import {
  asLink,
  heading,
  notHeading,
  plainText,
  positive,
  readMinutes,
  stars,
  tagList,
} from "../text.ts"
import type { AppRecipeBody } from "../types.ts"

// One Mealie recipe in Merran's terms. Mealie's API gives recipes in
// camelCase; its recipe exports (snake_case) and backups (database rows) are
// turned into the same shape first, so this reads all three.

/* eslint-disable @typescript-eslint/no-explicit-any -- Mealie's JSON varies by version */

/** A Mealie recipe, in the API's camelCase. */
export type MealieRecipe = Record<string, any>

/**
 * A Mealie id, dashed: Mealie on SQLite keeps ids as 32 hex digits, on
 * Postgres with dashes, and its photo folders always have them.
 */
export function mealieId(value: unknown): string {
  const id = String(value ?? "").toLowerCase()
  const hex = id.replace(/-/g, "")
  return /^[0-9a-f]{32}$/.test(hex)
    ? `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
    : id
}

export const mealieRef = (id: unknown) => `mealie:${mealieId(id)}`

/**
 * A Mealie time: ISO, with or without a zone (Mealie means UTC when it
 * leaves it off), or just a date.
 */
export function mealieDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null
  let text = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) text += "T00:00:00Z"
  // Microseconds, which not every date reader takes.
  text = text.replace(/(\.\d{3})\d+/, "$1")
  if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)) text += "Z"
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? null : date
}

/** An ingredient as a line: "2 cups flour, sifted". */
export function ingredientLine(item: any, disableAmount = false): string {
  if (typeof item === "string") return cleanText(item)
  const note = cleanText(item?.note)
  const original = cleanText(item?.originalText)
  const display = cleanText(item?.display)
  const unit = item?.unit
  const food = item?.food
  // Lines Mealie never parsed are all note, often with a made-up 1.
  if (!unit && !food) return note || original || display

  const quantity = disableAmount ? null : positive(item?.quantity)
  const plural = quantity !== null && quantity > 1
  const unitName = unit
    ? cleanText(
        unit.useAbbreviation && unit.abbreviation
          ? (plural && unit.pluralAbbreviation) || unit.abbreviation
          : (plural && unit.pluralName) || unit.name
      )
    : ""
  const foodName = food
    ? cleanText((plural && !unit && food.pluralName) || food.name)
    : ""
  const main = [quantity === null ? "" : formatQuantity(quantity), unitName]
    .concat(foodName)
    .filter(Boolean)
    .join(" ")
  if (!main) return note || original || display
  return note ? `${main}, ${note}` : main
}

function names(list: unknown): string[] {
  return Array.isArray(list)
    ? list
        .map((item) => (typeof item === "string" ? item : item?.name))
        .filter((name): name is string => typeof name === "string")
    : []
}

/** Tags and categories, both as tags. */
const tagsOf = (recipe: MealieRecipe) =>
  tagList([...names(recipe.tags), ...names(recipe.recipeCategory)])

/** Mealie's nutrition is text, like "250 kcal" or "12 g". */
function nutritionOf(value: any): Nutrition | null {
  if (!value || typeof value !== "object") return null
  const number = (key: string) => {
    const match = cleanText(value[key]).match(/\d+(?:[.,]\d+)?/)
    return match ? Number(match[0].replace(",", ".")) : undefined
  }
  const nutrition: Nutrition = { source: "site" }
  const fields = {
    calories: number("calories"),
    protein: number("proteinContent"),
    carbs: number("carbohydrateContent"),
    fat: number("fatContent"),
    fiber: number("fiberContent"),
    sugar: number("sugarContent"),
    sodium: number("sodiumContent"),
  }
  let any = false
  for (const [key, amount] of Object.entries(fields)) {
    if (amount === undefined) continue
    nutrition[key as keyof typeof fields] = amount
    any = true
  }
  return any ? nutrition : null
}

/** Servings, and what it makes when that isn't servings. */
function yieldOf(recipe: MealieRecipe) {
  const servings = positive(recipe.recipeServings)
  const quantity = positive(recipe.recipeYieldQuantity)
  const words = cleanText(recipe.recipeYield)
  // Mealie 2.3 and later split the yield up; before, it's all one text.
  if (servings !== null || quantity !== null) {
    return {
      servings: servings !== null && servings <= 1000 ? servings : null,
      yieldText: quantity
        ? `${formatQuantity(quantity)} ${words}`.trim().slice(0, 100)
        : null,
    }
  }
  return parseYield(words)
}

/** A Mealie recipe as Merran takes it, all but its photo and cooking notes. */
export function fromMealie(
  recipe: MealieRecipe
): Omit<AppRecipeBody, "photo" | "cookNotes" | "createdBy"> {
  const disableAmount = Boolean(recipe.settings?.disableAmount)

  const ingredients: string[] = []
  for (const item of Array.isArray(recipe.recipeIngredient)
    ? recipe.recipeIngredient
    : []) {
    ingredients.push(...heading(item?.title))
    const text = ingredientLine(item, disableAmount)
    if (text) ingredients.push(notHeading(text, 500))
  }

  const steps: string[] = []
  for (const step of Array.isArray(recipe.recipeInstructions)
    ? recipe.recipeInstructions
    : []) {
    steps.push(...heading(step?.title))
    const text = cleanText(typeof step === "string" ? step : step?.text)
    if (text) steps.push(notHeading(text, 5000))
  }

  const notes = (Array.isArray(recipe.notes) ? recipe.notes : [])
    .map((note: any) => {
      const title = cleanText(note?.title)
      const text = plainText(note?.text)
      return title && text ? `${title}: ${text}` : title || text
    })
    .filter(Boolean)
    .join("\n\n")

  const description = plainText(recipe.description)
  const createdAt =
    mealieDate(recipe.createdAt) ?? mealieDate(recipe.dateAdded) ?? null

  return {
    input: {
      name: (cleanText(recipe.name) || "Untitled recipe").slice(0, 200),
      description: description ? description.slice(0, 2000) : null,
      ...yieldOf(recipe),
      prepMinutes: readMinutes(recipe.prepTime),
      // Mealie's cooking time is "performTime"; cookTime is the old name.
      cookMinutes:
        readMinutes(recipe.performTime) ?? readMinutes(recipe.cookTime),
      totalMinutes: readMinutes(recipe.totalTime),
      notes: notes ? notes.slice(0, 5000) : null,
      sourceUrl: asLink(recipe.orgURL ?? recipe.orgUrl),
      rating: stars(recipe.rating),
      tags: tagsOf(recipe),
      ingredients: ingredients.slice(0, 300),
      steps: steps.slice(0, 200),
    },
    nutrition: nutritionOf(recipe.nutrition),
    lastMadeAt: mealieDate(recipe.lastMade),
    createdAt,
    updatedAt:
      mealieDate(recipe.updatedAt) ??
      mealieDate(recipe.updateAt) ??
      mealieDate(recipe.dateUpdated) ??
      createdAt,
  }
}

/**
 * Mealie's snake_case JSON (its recipe exports) in the API's camelCase:
 * `recipe_ingredient` is `recipeIngredient`.
 */
export function camelKeys(value: unknown): any {
  if (Array.isArray(value)) return value.map(camelKeys)
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key.replace(/_([a-z0-9])/g, (_, letter: string) => letter.toUpperCase()),
      camelKeys(item),
    ])
  )
}

/** A note from Mealie's history: its timeline or a comment. */
export function cookNoteOf(
  text: unknown,
  when: unknown,
  by: string | null
): { note: string; createdAt: Date; by: string | null } | null {
  const note = plainText(text)
  const createdAt = mealieDate(when)
  return note && createdAt ? { note: note.slice(0, 2000), createdAt, by } : null
}
