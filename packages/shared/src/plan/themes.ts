import type { Diet } from "../diets/diets.ts"

// Theme nights: taco Tuesday, fish on Friday, eat out on Saturday. They're
// for dinner, and Fill the week and the autoplan keep to them.

/**
 * What a theme night asks of dinner: a tag or word ("taco"), no meat,
 * fish, something never made, something quick, or nothing at all
 * (leftovers, eat out).
 */
export const THEME_KINDS = [
  "tag",
  "meatless",
  "fish",
  "new",
  "quick",
  "skip",
] as const
export type ThemeKind = (typeof THEME_KINDS)[number]

export type NightTheme = {
  kind: ThemeKind
  /** As it shows: "Tacos", "Something new", "Eat out". */
  name: string
  /** For a tag theme: the tag or word recipes have ("taco"). */
  tag?: string
}

/** The themes offered in Settings; any tag works too. */
export const THEME_PRESETS: readonly NightTheme[] = [
  { kind: "tag", name: "Tacos", tag: "taco" },
  { kind: "tag", name: "Pasta", tag: "pasta" },
  { kind: "tag", name: "Pizza", tag: "pizza" },
  { kind: "tag", name: "Soup", tag: "soup" },
  { kind: "tag", name: "Stir-fry", tag: "stir fry" },
  { kind: "meatless", name: "Meatless" },
  { kind: "fish", name: "Fish" },
  { kind: "new", name: "Something new" },
  { kind: "quick", name: "Something quick" },
  { kind: "skip", name: "Leftovers" },
  { kind: "skip", name: "Eat out" },
]

/** A week of themes, by weekday (0 is Sunday); null for none. */
export type WeekThemes = (NightTheme | null)[]

export const NO_THEMES: WeekThemes = [null, null, null, null, null, null, null]

/** A quick theme is this many minutes or fewer. */
export const QUICK_MINUTES = 30

/** "Taco night", "Something new", "Eat out": how a night shows on the plan. */
export function themeLabel(theme: NightTheme) {
  if (
    theme.kind !== "tag" &&
    theme.kind !== "meatless" &&
    theme.kind !== "fish"
  )
    return theme.name
  const name = theme.name.toLowerCase()
  const singular =
    /s$/.test(name) && !/ss$/.test(name) ? name.slice(0, -1) : name
  return `${singular[0]!.toUpperCase()}${singular.slice(1)} night`
}

/** "taco" matches "Chicken Tacos" and a "tacos" tag, "stir fry" "Stir-Fries". */
function hasWord(text: string, word: string) {
  const escaped = word
    .trim()
    .toLowerCase()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/[\s-]+/g, "[\\s-]*")
    .replace(/(?:e?s)$/, "")
    .replace(/y$/, "(?:y|ie)")
  return new RegExp(`\\b${escaped}(?:e?s)?\\b`, "i").test(text)
}

const FISH =
  /\b(fish|salmon|cod|tilapia|halibut|trout|tuna steaks?|ahi|mahi[- ]?mahi|sea bass|snapper|catfish|haddock|pollock|swordfish|shrimp|prawns?|scallops?|crab|lobster|mussels|clams|oysters|calamari|squid|seafood)\b/i

/** What a theme looks at in a recipe. */
export type ThemeRecipe = {
  name: string
  tags: readonly string[]
  diets: readonly Diet[]
  totalMinutes: number | null
  /** When it was last made, or null for never. */
  lastMadeAt: string | Date | null
  /** Its ingredient lines as written. */
  lines: readonly string[]
}

/** Whether a recipe suits a theme night. Nothing suits a skip night. */
export function fitsTheme(recipe: ThemeRecipe, theme: NightTheme) {
  switch (theme.kind) {
    case "tag":
      return (
        recipe.tags.some((tag) => hasWord(tag, theme.tag ?? theme.name)) ||
        hasWord(recipe.name, theme.tag ?? theme.name)
      )
    case "meatless":
      return (
        recipe.diets.includes("vegetarian") || recipe.diets.includes("vegan")
      )
    case "fish":
      return (
        recipe.tags.some((tag) => FISH.test(tag)) ||
        FISH.test(recipe.name) ||
        recipe.lines.some((line) => FISH.test(line))
      )
    case "new":
      return recipe.lastMadeAt === null
    case "quick":
      return (
        recipe.totalMinutes !== null && recipe.totalMinutes <= QUICK_MINUTES
      )
    case "skip":
      return false
  }
}
