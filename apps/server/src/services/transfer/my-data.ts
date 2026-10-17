import type { EntityManager } from "@mikro-orm/sql"
import { ApiKey, CookNote, User } from "../../database/entities/index.ts"
import { HOUSEHOLD_FILTER, NOT_DELETED_FILTER } from "../../database/scope.ts"
import { membershipsOf } from "../households.ts"

/** Everywhere, Recently deleted too: it's all theirs to see. */
const EVERYWHERE = {
  filters: { [HOUSEHOLD_FILTER]: false, [NOT_DELETED_FILTER]: false },
}

/**
 * A person's own data, to keep or take elsewhere: their account, the
 * households they're in, the cooking notes they wrote and their API keys
 * (never the keys themselves). A household's recipes are in its export.
 */
export async function exportMyData(em: EntityManager, userId: string) {
  const user = await em.findOneOrFail(User, { id: userId })
  const memberships = await membershipsOf(em, userId)
  const notes = await em.find(
    CookNote,
    { user: userId },
    {
      ...EVERYWHERE,
      populate: ["recipe", "household"],
      orderBy: { createdAt: "asc" },
    }
  )
  const keys = await em.find(
    ApiKey,
    { user: userId },
    { ...EVERYWHERE, populate: ["household"], orderBy: { createdAt: "asc" } }
  )
  return {
    format: "merran.person" as const,
    version: 1,
    exportedAt: new Date().toISOString(),
    account: {
      name: user.name,
      email: user.email,
      username: user.username ?? null,
      createdAt: user.createdAt.toISOString(),
      preferences: (user.preferences as Record<string, unknown> | null) ?? {},
    },
    households: memberships.map((membership) => ({
      name: membership.household.getEntity().name,
      role: membership.role,
      joinedAt: membership.createdAt.toISOString(),
    })),
    cookingNotes: notes.map((note) => ({
      household: note.household.getEntity().name,
      recipe: note.recipe.getEntity().name,
      rating: note.rating ?? null,
      note: note.note ?? null,
      createdAt: note.createdAt.toISOString(),
    })),
    apiKeys: keys.map((key) => ({
      name: key.name,
      household: key.household.getEntity().name,
      permissions: key.permissions as Record<string, string>,
      createdAt: key.createdAt.toISOString(),
      lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
      expiresAt: key.expiresAt?.toISOString() ?? null,
    })),
  }
}
