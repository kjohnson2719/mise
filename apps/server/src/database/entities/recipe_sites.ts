import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { createdAt, id } from "./base.ts"

/**
 * A recipe site Merran reads, by its feed: one a household follows, or one
 * suggested for starter collections. Read once for every household; who
 * follows it is in `followed_sites`.
 */
export const RecipeSite = defineEntity({
  name: "RecipeSite",
  tableName: "recipe_sites",
  properties: {
    id: id(),
    name: p.string(),
    /** Its home page. */
    url: p.text(),
    /** Its RSS or Atom feed: one site for each. */
    feedUrl: p.text().unique(),
    /** The language it's written in, like "en", when it's known. */
    language: p.string().nullable(),
    /** What the feed last said it was, so Merran only asks for what's new. */
    etag: p.text().nullable(),
    lastModified: p.text().nullable(),
    /** When its feed was last read. */
    readAt: p.datetime().nullable(),
    /** When it's next read. Later after it turned Merran away. */
    nextReadAt: p.datetime().onCreate(() => new Date()),
    /** Why its feed couldn't be read last time, for whoever follows it. */
    error: p.text().nullable(),
    createdAt: createdAt(),
  },
  indexes: [{ properties: ["nextReadAt"] }],
})
export type RecipeSite = InferEntity<typeof RecipeSite>
