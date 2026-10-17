import type { Dictionary } from "@mikro-orm/core"
import type { EntityManager } from "@mikro-orm/sql"

/**
 * Every household-owned entity has this filter, on by default and needing the
 * household's id. A query on one of them without a household throws, so no
 * one can forget the `where`.
 */
export const HOUSEHOLD_FILTER = "household"

export const householdFilter = {
  [HOUSEHOLD_FILTER]: {
    name: HOUSEHOLD_FILTER,
    cond: (args: Dictionary) => ({ household: args.householdId }),
    default: true,
  },
}

/** Recipes in Recently deleted are left out unless a query asks for them. */
export const NOT_DELETED_FILTER = "notDeleted"

export const notDeletedFilter = {
  [NOT_DELETED_FILTER]: {
    name: NOT_DELETED_FILTER,
    cond: { deletedAt: null },
    default: true,
    args: false,
  },
}

/** An entity manager that only sees, changes and deletes one household's rows. */
export function forHousehold<EM extends EntityManager>(
  em: EM,
  householdId: string
): EM {
  const scoped = em.fork()
  scoped.setFilterParams(HOUSEHOLD_FILTER, { householdId })
  return scoped as EM
}

/**
 * Find options for the rare server-wide job that must see every household,
 * like purging Recently deleted. Use it on purpose, never by default.
 */
export const ACROSS_HOUSEHOLDS = {
  filters: { [HOUSEHOLD_FILTER]: false },
} as const
