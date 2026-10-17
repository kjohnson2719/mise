import type { EntityManager } from "@mikro-orm/sql"
import { Recipe } from "../../database/entities/index.ts"
import { NOT_DELETED_FILTER } from "../../database/scope.ts"

/** Paths under /recipes that mean something else, in the API and the web app. */
const RESERVED = new Set([
  "new",
  "deleted",
  "tags",
  "import",
  "bulk",
  "tidy",
  "review",
  "discover",
  "nutrition",
  "photos",
  "find",
])

/** "Mom's Lemon Chicken!" → "moms-lemon-chicken". */
export function slugify(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "")
  return slug || "recipe"
}

/**
 * A slug for a new recipe that no other recipe in the household has, in
 * Recently deleted too: "lemon-chicken", then "lemon-chicken-2".
 */
export async function uniqueSlug(em: EntityManager, name: string) {
  const base = slugify(name)
  const similar = await em.find(
    Recipe,
    { slug: { $like: `${base}%` } },
    { fields: ["slug"], filters: { [NOT_DELETED_FILTER]: false } }
  )
  const taken = new Set([...RESERVED, ...similar.map((recipe) => recipe.slug)])
  if (!taken.has(base)) return base
  for (let n = 2; ; n++) {
    if (!taken.has(`${base}-${n}`)) return `${base}-${n}`
  }
}
