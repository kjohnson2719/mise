import type { EntityManager } from "@mikro-orm/sql"
import { SqlitePlatform } from "@mikro-orm/sqlite"

/**
 * A condition for text containing `words`, ignoring case, on either
 * database: SQLite's `like` already ignores case (for plain letters), and
 * Postgres needs `ilike`. Wildcards in the words are taken as spaces.
 */
export function containing(em: EntityManager, words: string) {
  const pattern = `%${words.replace(/[%_\\]/g, " ")}%`
  return em.getPlatform() instanceof SqlitePlatform
    ? { $like: pattern }
    : { $ilike: pattern }
}
