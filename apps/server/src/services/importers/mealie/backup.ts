import type { OpenZip } from "../../transfer/zip.ts"
import type { AppCookNote, AppSource } from "../types.ts"
import {
  cookNoteOf,
  fromMealie,
  mealieDate,
  mealieId,
  mealieRef,
  type MealieRecipe,
} from "./recipe.ts"

// A Mealie backup (Admin → Backups): database.json, with every table as
// rows, and data/ with each recipe's photos. Read the same from Mealie 1.0
// to 3.x by looking at which tables and columns are there, never at the
// version.

/* eslint-disable @typescript-eslint/no-explicit-any -- rows straight from Mealie's database */

type Row = Record<string, any>

/** Rows grouped by one of their columns, which holds an id. */
function byId(rows: Row[], column: string) {
  const grouped = new Map<string, Row[]>()
  for (const row of rows) {
    const key = mealieId(row[column])
    const list = grouped.get(key)
    if (list) list.push(row)
    else grouped.set(key, [row])
  }
  return grouped
}

const ordered = (rows: Row[] | undefined, column: string) =>
  [...(rows ?? [])].sort(
    (a, b) => Number(a[column] ?? 0) - Number(b[column] ?? 0)
  )

/**
 * Reads a backup, or says it isn't one. Zips made again on a Mac can have
 * everything one folder down.
 */
export async function readMealieBackup(zip: OpenZip) {
  const database = zip
    .names()
    .filter(
      (name) =>
        /(?:^|\/)database\.json$/.test(name) && !name.startsWith("__MACOSX/")
    )
    .sort((a, b) => a.length - b.length)[0]
  if (!database) return null
  const root = database.slice(0, -"database.json".length)

  let tables: Record<string, Row[]>
  try {
    tables = JSON.parse((await zip.read(database))!.toString("utf8"))
  } catch {
    return null
  }
  if (
    !tables ||
    !Array.isArray(tables.recipes) ||
    !Array.isArray(tables.alembic_version)
  ) {
    return null
  }
  const rows = (table: string): Row[] =>
    Array.isArray(tables[table]) ? tables[table] : []

  const emails = new Map(
    rows("users").map((user) => [mealieId(user.id), user.email as string])
  )
  const emailOf = (id: unknown): string | null =>
    (id ? emails.get(mealieId(id))?.trim() : null) || null
  const units = new Map(
    rows("ingredient_units").map((u) => [mealieId(u.id), u])
  )
  const foods = new Map(
    rows("ingredient_foods").map((f) => [mealieId(f.id), f])
  )
  const ingredients = byId(rows("recipes_ingredients"), "recipe_id")
  const instructions = byId(rows("recipe_instructions"), "recipe_id")
  const notes = byId(rows("notes"), "recipe_id")
  const nutrition = byId(rows("recipe_nutrition"), "recipe_id")
  const settings = byId(rows("recipe_settings"), "recipe_id")
  const tagNames = new Map(rows("tags").map((t) => [mealieId(t.id), t.name]))
  const categoryNames = new Map(
    rows("categories").map((c) => [mealieId(c.id), c.name])
  )
  const tags = byId(rows("recipes_to_tags"), "recipe_id")
  const categories = byId(rows("recipes_to_categories"), "recipe_id")
  // Mealie 2.5 and later keep when it was last made per household.
  const madeIn = byId(rows("households_to_recipes"), "recipe_id")
  const events = byId(rows("recipe_timeline_events"), "recipe_id")
  const comments = byId(rows("recipe_comments"), "recipe_id")

  const groups = rows("groups").map((group) => ({
    id: mealieId(group.id),
    name: String(group.name ?? ""),
    recipes: rows("recipes").filter(
      (recipe) => mealieId(recipe.group_id) === mealieId(group.id)
    ).length,
  }))

  const unitOf = (id: unknown) => {
    const unit = id ? units.get(mealieId(id)) : undefined
    return unit
      ? {
          name: unit.name,
          pluralName: unit.plural_name,
          abbreviation: unit.abbreviation,
          pluralAbbreviation: unit.plural_abbreviation,
          useAbbreviation: unit.use_abbreviation,
        }
      : null
  }
  const foodOf = (id: unknown) => {
    const food = id ? foods.get(mealieId(id)) : undefined
    return food ? { name: food.name, pluralName: food.plural_name } : null
  }

  /** A row of the recipes table as the API would give it. */
  function asRecipe(row: Row): MealieRecipe {
    const id = mealieId(row.id)
    const madeAt = (madeIn.get(id) ?? [])
      .map((made) => mealieDate(made.last_made))
      .filter((date): date is Date => date !== null)
      .sort((a, b) => b.getTime() - a.getTime())[0]
    const nutrients = nutrition.get(id)?.[0]
    return {
      id,
      name: row.name,
      description: row.description,
      recipeIngredient: ordered(ingredients.get(id), "position").map(
        (item) => ({
          title: item.title,
          note: item.note,
          quantity: item.quantity,
          originalText: item.original_text,
          unit: unitOf(item.unit_id),
          food: foodOf(item.food_id),
        })
      ),
      recipeInstructions: ordered(instructions.get(id), "position").map(
        (step) => ({ title: step.title, text: step.text })
      ),
      notes: ordered(notes.get(id), "id").map((note) => ({
        title: note.title,
        text: note.text,
      })),
      nutrition: nutrients && {
        calories: nutrients.calories,
        proteinContent: nutrients.protein_content,
        carbohydrateContent: nutrients.carbohydrate_content,
        fatContent: nutrients.fat_content,
        fiberContent: nutrients.fiber_content,
        sugarContent: nutrients.sugar_content,
        sodiumContent: nutrients.sodium_content,
      },
      tags: (tags.get(id) ?? []).map((link) => ({
        name: tagNames.get(mealieId(link.tag_id)),
      })),
      recipeCategory: (categories.get(id) ?? []).map((link) => ({
        name: categoryNames.get(mealieId(link.category_id)),
      })),
      recipeYield: row.recipe_yield,
      recipeYieldQuantity: row.recipe_yield_quantity,
      recipeServings: row.recipe_servings,
      prepTime: row.prep_time,
      performTime: row.perform_time,
      cookTime: row.cook_time,
      totalTime: row.total_time,
      orgURL: row.org_url,
      rating: row.rating,
      lastMade: madeAt?.toISOString() ?? row.last_made,
      dateAdded: row.date_added,
      createdAt: row.created_at,
      updatedAt: row.update_at ?? row.date_updated,
      settings: { disableAmount: settings.get(id)?.[0]?.disable_amount },
    }
  }

  /** What people wrote: "Made it" with a comment, and comments. */
  function cookNotes(id: string): AppCookNote[] {
    const notes = [
      ...(events.get(id) ?? [])
        .filter((event) => event.event_type === "comment")
        .map((event) =>
          cookNoteOf(event.message, event.timestamp, emailOf(event.user_id))
        ),
      ...(comments.get(id) ?? []).map((comment) =>
        cookNoteOf(comment.text, comment.created_at, emailOf(comment.user_id))
      ),
    ]
    return notes
      .filter((note): note is AppCookNote => note !== null)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  }

  /** The recipes in one group, or every group. */
  const recipesIn = (group: string | null) =>
    rows("recipes").filter(
      (row) => !group || mealieId(row.group_id) === mealieId(group)
    )

  return {
    groups,
    refs: (group: string | null) =>
      recipesIn(group).map((row) => mealieRef(row.id)),
    source(group: string | null): AppSource {
      const recipes = recipesIn(group)
      return {
        app: "mealie",
        total: recipes.length,
        async *recipes() {
          for (const row of recipes) {
            const id = mealieId(row.id)
            yield {
              ref: mealieRef(id),
              name: String(row.name ?? ""),
              read: async () => ({
                ...fromMealie(asRecipe(row)),
                createdBy: emailOf(row.user_id),
                cookNotes: cookNotes(id),
                photo: () =>
                  zip.read(`${root}data/recipes/${id}/images/original.webp`),
              }),
            }
          }
        },
        close: zip.close,
      }
    },
  }
}
