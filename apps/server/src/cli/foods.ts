import { readFileSync } from "node:fs"
import { lineFoods } from "@merran/shared"
import { loadConfig } from "../core/config.ts"
import {
  Recipe,
  RecipeIngredient,
  SiteRecipe,
} from "../database/entities/index.ts"
import { openDatabase } from "../database/orm.ts"
import { ACROSS_HOUSEHOLDS } from "../database/scope.ts"

/** The foods not known yet listed, most common first. */
const LISTED = 60

/**
 * How much of a library the food vocabulary knows (docs/foods.md): every
 * ingredient line on this server, its recipes' and the recipe sites', or
 * a file's: a text file's lines, one to a line, or a JSON Lines file's
 * recipes, each with an "ingredients" list. Prints the share it knows and
 * the foods it doesn't, most common first, for growing the vocabulary. A
 * line naming more than one food ("salt and pepper") is known if each is.
 * It only reads.
 */
export async function foodsCoverage(
  args: readonly string[],
  env: Record<string, string | undefined> = process.env
): Promise<number> {
  const file = args.find((arg) => !arg.startsWith("--"))
  const all = args.includes("--all")
  const lines = file ? readLines(file) : await serverLines(env)

  let counted = 0
  let known = 0
  const unknown = new Map<string, { count: number; example: string }>()
  for (const line of lines) {
    const foods = lineFoods(line)
    if (foods.length === 0) continue
    counted++
    if (foods.every((food) => food.known)) known++
    for (const food of foods) {
      if (food.known) continue
      const was = unknown.get(food.key)
      if (was) was.count++
      else unknown.set(food.key, { count: 1, example: line })
    }
  }

  const share = counted ? Math.round((known / counted) * 1000) / 10 : 100
  console.log(
    `Foods known in ${known.toLocaleString()} of ${counted.toLocaleString()} ingredient lines (${share}%).`
  )
  const ranked = [...unknown].sort((a, b) => b[1].count - a[1].count)
  if (ranked.length === 0) return 0
  console.log(`\n${ranked.length} foods it doesn't know, most common first:\n`)
  const width = Math.min(40, Math.max(...ranked.map(([key]) => key.length)))
  for (const [key, { count, example }] of all
    ? ranked
    : ranked.slice(0, LISTED)) {
    console.log(
      `${String(count).padStart(5)}  ${key.padEnd(width)}  ${example}`
    )
  }
  if (!all && ranked.length > LISTED) {
    console.log(
      `\n...and ${ranked.length - LISTED} more (--all lists them all).`
    )
  }
  return 0
}

/**
 * A file's ingredient lines: a text file's, one to a line, or a JSON Lines
 * file's, one recipe to a line with its "ingredients". A record that isn't
 * whole yet, as the last one in a file still being written, is skipped.
 */
function readLines(file: string) {
  const rows = readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (!file.endsWith(".jsonl")) return rows
  return rows.flatMap((row) => {
    try {
      const recipe = JSON.parse(row) as { ingredients?: unknown }
      return Array.isArray(recipe.ingredients)
        ? recipe.ingredients.filter(
            (line): line is string =>
              typeof line === "string" && line.trim() !== ""
          )
        : []
    } catch {
      return []
    }
  })
}

/** Every ingredient line on the server: its households' recipes, and the sites'. */
async function serverLines(env: Record<string, string | undefined>) {
  const config = loadConfig(env)
  const database = await openDatabase(config.database)
  try {
    const em = database.em.fork()
    const recipes = await em.find(
      Recipe,
      {},
      { ...ACROSS_HOUSEHOLDS, fields: ["id"] }
    )
    const ids = new Set(recipes.map((recipe) => recipe.id))
    const lines = (
      await em.find(
        RecipeIngredient,
        {},
        { ...ACROSS_HOUSEHOLDS, fields: ["recipe", "rawText"] }
      )
    )
      .filter((line) => ids.has(line.recipe.id))
      .map((line) => line.rawText)
    const sites = await em.find(SiteRecipe, {}, { fields: ["ingredients"] })
    return [...lines, ...sites.flatMap((recipe) => recipe.ingredients ?? [])]
  } finally {
    await database.close()
  }
}
