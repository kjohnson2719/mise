import { INGREDIENT_MARKS } from "@merran/shared"
import { z } from "zod"
import { VERSION_SOURCES } from "../../database/entities/index.ts"

// The Merran export format (docs/export-format.md): a zip of JSON and
// photos. These schemas are the format: exports are written from them, and
// imports are checked against them. A change that older Merrans couldn't
// read needs a new version, and imports keep reading the old ones.

export const EXPORT_FORMAT = "merran.household"
export const EXPORT_VERSION = 1

/** The files in an export. */
export const EXPORT_FILES = {
  manifest: "merran-export.json",
  household: "household.json",
  recipes: "recipes.json",
} as const

/** A recipe's photo in the zip: "photos/<recipe id>.webp". */
export const photoPath = (recipeId: string) => `photos/${recipeId}.webp`

const when = z.iso.datetime()
/** Who did something, by email, so they can be found on another server. */
const by = z.string().nullable()

export const ManifestSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  version: z.number().int().min(1),
  exportedAt: when,
  merranVersion: z.string(),
  household: z.object({ name: z.string() }),
  counts: z.object({ recipes: z.number(), photos: z.number() }),
})
export type Manifest = z.infer<typeof ManifestSchema>

export const HouseholdFileSchema = z.object({
  name: z.string().min(1).max(100),
  timeZone: z.string(),
  country: z.string().length(2).nullable(),
  currency: z.string().length(3).nullable(),
  weekStartsOn: z.number().int().min(0).max(6),
  /** Planning settings, as the household keeps them. */
  planning: z.record(z.string(), z.unknown()).nullable(),
  /** Module settings it set, by key; never secrets. */
  settings: z.record(z.string(), z.unknown()),
})
export type HouseholdFile = z.infer<typeof HouseholdFileSchema>

const Line = z.object({
  section: z.string().nullable(),
  text: z.string().min(1).max(5000),
  /** An ingredient's mark. Added after version 1 came out. */
  mark: z.enum(INGREDIENT_MARKS).nullable().optional(),
})

export const RecipeFileSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string().min(1).max(200),
  description: z.string().nullable(),
  servings: z.number().nullable(),
  yieldText: z.string().nullable(),
  prepMinutes: z.number().int().nullable(),
  cookMinutes: z.number().int().nullable(),
  totalMinutes: z.number().int().nullable(),
  notes: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  rating: z.number().int().min(1).max(5).nullable(),
  nutrition: z.record(z.string(), z.unknown()).nullable(),
  dietOverrides: z.record(z.string(), z.boolean()),
  /** Added after version 1 came out, so older exports don't have it. */
  needs: z.array(z.string().max(60)).max(50).optional(),
  origin: z.string(),
  /** Added after version 1 came out, so older exports don't have it. */
  importedFrom: z.string().max(200).nullable().optional(),
  lastMadeAt: when.nullable(),
  createdAt: when,
  updatedAt: when,
  createdBy: by,
  tags: z.array(z.string()),
  ingredients: z.array(Line),
  steps: z.array(Line),
  /** Its photo's path in the zip, or null. */
  photo: z.string().nullable(),
  versions: z.array(
    z.object({
      source: z.enum(VERSION_SOURCES),
      snapshot: z.record(z.string(), z.unknown()),
      createdAt: when,
      createdBy: by,
    })
  ),
  cookNotes: z.array(
    z.object({
      rating: z.number().int().min(1).max(5).nullable(),
      note: z.string().nullable(),
      createdAt: when,
      by,
    })
  ),
  pairings: z.array(
    z.union([z.object({ recipe: z.string() }), z.object({ tag: z.string() })])
  ),
})
export type RecipeFile = z.infer<typeof RecipeFileSchema>
