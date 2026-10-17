import type { z } from "zod"
import type { Nutrition } from "../../database/entities/index.ts"
import type { RecipeInputSchema } from "../../http/schemas/recipes.ts"

// Importers bring recipes in from other apps. Each reads its app's files or
// server and hands over recipes in this one shape; the import job does the
// rest (see job.ts). Another app is another adapter.

/** The apps recipes can come from. */
export type ImportApp = "mealie" | "paprika"

/** A note on how cooking it went, from the app's own history. */
export type AppCookNote = {
  note: string
  createdAt: Date
  /** Who wrote it, by email, when the app says. */
  by: string | null
}

/** What's in one of the app's recipes. */
export type AppRecipeBody = {
  /** As if typed into the editor; it's checked before it's saved. */
  input: z.input<typeof RecipeInputSchema>
  nutrition: Nutrition | null
  lastMadeAt: Date | null
  createdAt: Date | null
  updatedAt: Date | null
  /** Who added it, by email, when the app says. */
  createdBy: string | null
  cookNotes: AppCookNote[]
  /** Its photo, read only when it's wanted. */
  photo(): Promise<Buffer | null>
}

/** One of the app's recipes, read only once it's known not to be here. */
export type AppRecipe = {
  /** What it is in the app, like "mealie:<id>": it comes in once. */
  ref: string
  /** For saying which one didn't come in. */
  name: string
  read(): Promise<AppRecipeBody>
}

/** The recipes in a file or server, one at a time. */
export type AppSource = {
  app: ImportApp
  /** How many there are, for progress. */
  total: number
  recipes(): AsyncGenerator<AppRecipe>
  close(): void
}
