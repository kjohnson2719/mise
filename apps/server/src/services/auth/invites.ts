import { createHash, randomBytes } from "node:crypto"
import type { EntityManager } from "@mikro-orm/sql"
import {
  HouseholdMember,
  InviteLink,
  type INVITE_ROLES,
} from "../../database/entities/index.ts"
import { ACROSS_HOUSEHOLDS } from "../../database/scope.ts"
import { AppError } from "../../core/errors.ts"

const INVITE_DAYS = 7

export type InviteRole = (typeof INVITE_ROLES)[number]

function hash(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

/**
 * Makes an invite link's token. It's shown once: only its hash is kept, so a
 * copy of the database can't be used to join anything.
 */
export async function createInviteLink(
  em: EntityManager,
  {
    householdId,
    role,
    createdBy,
  }: { householdId: string; role: InviteRole; createdBy: string }
) {
  const token = randomBytes(24).toString("base64url")
  const invite = em.create(InviteLink, {
    household: householdId,
    tokenHash: hash(token),
    role,
    createdBy,
    expiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000),
  })
  await em.flush()
  return { invite, token }
}

/**
 * The invite for a token, if it can still be used. Looked up across
 * households on purpose: the token is what proves which one.
 */
export async function findUsableInvite(em: EntityManager, token: string) {
  const invite = await em.findOne(
    InviteLink,
    { tokenHash: hash(token) },
    { ...ACROSS_HOUSEHOLDS, populate: ["household"] }
  )
  if (!invite) {
    throw new AppError(
      "not_found",
      "invite_not_found",
      "That invite link doesn't work."
    )
  }
  if (invite.usedAt) {
    throw new AppError("gone", "invite_used", "That invite link has been used.")
  }
  if (invite.expiresAt < new Date()) {
    throw new AppError(
      "gone",
      "invite_expired",
      "That invite link has expired."
    )
  }
  return invite
}

/**
 * Adds a person to the invite's household and uses up the link, together:
 * if two people open the same link at once, only one gets in.
 */
export async function acceptInvite(
  em: EntityManager,
  invite: InviteLink,
  userId: string
) {
  const householdId = invite.household.id
  await em.transactional(async (tx) => {
    const claimed = await tx.nativeUpdate(
      InviteLink,
      { id: invite.id, household: householdId, usedAt: null },
      { usedAt: new Date(), usedBy: userId },
      ACROSS_HOUSEHOLDS
    )
    if (claimed === 0) {
      throw new AppError(
        "gone",
        "invite_used",
        "That invite link has been used."
      )
    }
    const already = await tx.count(
      HouseholdMember,
      { household: householdId, user: userId },
      ACROSS_HOUSEHOLDS
    )
    if (already > 0) {
      throw new AppError(
        "conflict",
        "already_member",
        "You're already in this household."
      )
    }
    tx.create(HouseholdMember, {
      household: householdId,
      user: userId,
      role: invite.role,
    })
  })
}
