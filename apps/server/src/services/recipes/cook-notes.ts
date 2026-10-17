import type { EntityManager } from "@mikro-orm/sql"
import { AppError } from "../../core/errors.ts"
import { CookNote } from "../../database/entities/index.ts"
import type { CookNoteInput } from "../../http/schemas/recipes.ts"
import { findRecipe } from "./recipes.ts"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The newest notes kept on show for a recipe. */
const SHOWN = 50

function describeNote(note: CookNote) {
  return {
    id: note.id,
    rating: note.rating ?? null,
    note: note.note ?? null,
    by: note.user?.getEntity().name ?? null,
    createdAt: note.createdAt.toISOString(),
  }
}

/** How cooking a recipe went, each time, newest first. */
export async function listCookNotes(em: EntityManager, idOrSlug: string) {
  const recipe = await findRecipe(em, idOrSlug)
  const notes = await em.find(
    CookNote,
    { recipe: recipe.id },
    {
      populate: ["user"],
      orderBy: { createdAt: "desc", id: "desc" },
      limit: SHOWN,
    }
  )
  return notes.map(describeNote)
}

/**
 * "How did it go?": stars, a note for next time, or both. The stars become
 * the recipe's rating; like rating it, that isn't an edit, so no version
 * is kept.
 */
export async function addCookNote(
  em: EntityManager,
  options: {
    householdId: string
    userId: string | null
    recipe: string
    input: CookNoteInput
  }
) {
  const recipe = await findRecipe(em, options.recipe)
  const note = em.create(CookNote, {
    household: options.householdId,
    recipe,
    user: options.userId,
    rating: options.input.rating,
    note: options.input.note,
  })
  if (options.input.rating !== null) recipe.rating = options.input.rating
  await em.flush()
  await em.populate(note, ["user"])
  return describeNote(note)
}

export async function deleteCookNote(
  em: EntityManager,
  options: { recipe: string; noteId: string }
) {
  const recipe = await findRecipe(em, options.recipe)
  const note = UUID.test(options.noteId)
    ? await em.findOne(CookNote, { id: options.noteId, recipe: recipe.id })
    : null
  if (!note) {
    throw new AppError(
      "not_found",
      "cook_note_not_found",
      "There's no such note."
    )
  }
  await em.remove(note).flush()
}
