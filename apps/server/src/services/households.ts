import { randomBytes } from "node:crypto"
import type { EntityManager } from "@mikro-orm/sql"
import {
  Household,
  HouseholdMember,
  Session,
  ShoppingList,
  type HOUSEHOLD_ROLES,
} from "../database/entities/index.ts"
import { ACROSS_HOUSEHOLDS } from "../database/scope.ts"
import { AppError } from "../core/errors.ts"

export type HouseholdRole = (typeof HOUSEHOLD_ROLES)[number]

/** "Mom & Dad's" becomes "mom-dads-3f9a1c": readable, and unique. */
function slugFor(name: string) {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)
  return `${base || "household"}-${randomBytes(3).toString("hex")}`
}

/**
 * Finds the household's members by email, for imports that name people that
 * way. Anyone who isn't a member is null.
 */
export async function membersByEmail(em: EntityManager, householdId: string) {
  const members = await em.find(
    HouseholdMember,
    { household: householdId },
    { ...ACROSS_HOUSEHOLDS, populate: ["user"] }
  )
  const byEmail = new Map(
    members.map((member) => [
      member.user.getEntity().email.toLowerCase(),
      member.user.id,
    ])
  )
  return (email: string | null | undefined) =>
    (email && byEmail.get(email.toLowerCase())) ?? null
}

/**
 * Starts a household with its first person as the owner, and the main
 * shopping list every household has.
 */
export async function createHousehold(
  em: EntityManager,
  { name, ownerId }: { name: string; ownerId: string }
) {
  const household = em.create(Household, { name, slug: slugFor(name) })
  em.create(HouseholdMember, { household, user: ownerId, role: "owner" })
  em.create(ShoppingList, {
    household,
    name: "Shopping list",
    main: true,
  })
  await em.flush()
  return household
}

/** Every household a person belongs to, oldest membership first. */
export async function membershipsOf(em: EntityManager, userId: string) {
  return em.find(
    HouseholdMember,
    { user: userId },
    {
      ...ACROSS_HOUSEHOLDS,
      populate: ["household"],
      orderBy: { createdAt: "asc" },
    }
  )
}

/** A person's role in a household, or null when they don't belong to it. */
export async function roleIn(
  em: EntityManager,
  userId: string,
  householdId: string
): Promise<HouseholdRole | null> {
  const member = await em.findOne(
    HouseholdMember,
    { user: userId, household: householdId },
    ACROSS_HOUSEHOLDS
  )
  return member?.role ?? null
}

export function isAdminRole(role: HouseholdRole | null) {
  return role === "owner" || role === "admin"
}

export type ActiveHousehold = { id: string; role: HouseholdRole }

/**
 * The household a signed-in person is using: the one their session is on,
 * if they still belong to it, otherwise their first, which the session then
 * moves to. Null when they're in no household.
 */
export async function resolveActiveHousehold(
  em: EntityManager,
  {
    userId,
    sessionId,
    activeHouseholdId,
  }: { userId: string; sessionId: string; activeHouseholdId: string | null }
): Promise<ActiveHousehold | null> {
  if (activeHouseholdId) {
    const role = await roleIn(em, userId, activeHouseholdId)
    if (role) return { id: activeHouseholdId, role }
  }
  const [first] = await membershipsOf(em, userId)
  if (!first) return null
  await em.nativeUpdate(
    Session,
    { id: sessionId },
    { activeHousehold: first.household.id }
  )
  return { id: first.household.id, role: first.role }
}

/** A member of the household `em` is scoped to, with their user loaded. */
export async function findMember(em: EntityManager, memberId: string) {
  const member = await em.findOne(HouseholdMember, memberId, {
    populate: ["user"],
  })
  if (!member) {
    throw new AppError(
      "not_found",
      "member_not_found",
      "That person isn't in the household."
    )
  }
  return member
}

/**
 * Changing someone's role, or removing them (`newRole` null), mustn't leave
 * the household without an owner. `em` is scoped to the household.
 */
export async function assertOwnerRemains(
  em: EntityManager,
  member: HouseholdMember,
  newRole: HouseholdRole | null
) {
  if (member.role !== "owner" || newRole === "owner") return
  const owners = await em.count(HouseholdMember, { role: "owner" })
  if (owners <= 1) {
    throw new AppError(
      "conflict",
      "last_owner",
      "Make someone else an owner first. A household always needs one."
    )
  }
}
