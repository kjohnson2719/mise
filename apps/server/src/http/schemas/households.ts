import { z } from "@hono/zod-openapi"
import { plannedMeals } from "@merran/shared"
import {
  HOUSEHOLD_ROLES,
  INVITE_ROLES,
  MEALS,
  type Household,
  type HouseholdMember,
  type InviteLink,
} from "../../database/entities/index.ts"
import type { HouseholdRole } from "../../services/households.ts"
import { HOUSEHOLD, INVITE_LINK, MEMBER } from "./examples.ts"

function isTimeZone(zone: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone })
    return true
  } catch {
    return false
  }
}

export const HouseholdSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    country: z.string().nullable(),
    currency: z.string().nullable(),
    timeZone: z.string(),
    weekStartsOn: z.number().int(),
    meals: z.array(z.enum(MEALS)).openapi({
      description:
        "The meals filled for it (by Fill the week and Plan each week), in a day's order: every meal until it opts out of some. Any meal can be planned by hand.",
    }),
    /** Your role in it. */
    role: z.enum(HOUSEHOLD_ROLES),
  })
  .openapi("Household", { example: HOUSEHOLD })

export const HouseholdNameSchema = z
  .string()
  .trim()
  .min(1, "Give it a name.")
  .max(100)

export const HouseholdChangesSchema = z
  .object({
    name: HouseholdNameSchema,
    country: z
      .string()
      .regex(/^[A-Z]{2}$/, "Use a two-letter country code, like US.")
      .nullable(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/, "Use a three-letter currency code, like USD.")
      .nullable(),
    timeZone: z.string().refine(isTimeZone, "That isn't a time zone."),
    weekStartsOn: z.number().int().min(0).max(6),
    meals: z
      .array(z.enum(MEALS))
      .min(1, "Plan at least one meal.")
      .openapi({ description: "The meals filled for it." }),
  })
  .partial()
  .openapi("HouseholdChanges", {
    example: { name: "The Rivera-Parks", weekStartsOn: 1 },
  })

export const MemberSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    name: z.string(),
    username: z.string().nullable(),
    role: z.enum(HOUSEHOLD_ROLES),
    joinedAt: z.iso.datetime(),
  })
  .openapi("Member", { example: MEMBER })

export const InviteLinkSchema = z
  .object({
    id: z.string(),
    role: z.enum(INVITE_ROLES),
    expiresAt: z.iso.datetime(),
    createdAt: z.iso.datetime(),
  })
  .openapi("InviteLink", { example: INVITE_LINK })

export const NewInviteLinkSchema = InviteLinkSchema.extend({
  /** The link to send. Shown only now. */
  link: z.url(),
}).openapi("NewInviteLink", {
  example: {
    ...INVITE_LINK,
    link: "https://merran.example.com/join/sample-invite-token",
  },
})

export const MemberParam = z.object({
  memberId: z.string().openapi({ param: { name: "memberId", in: "path" } }),
})

export const InviteParam = z.object({
  inviteId: z.string().openapi({ param: { name: "inviteId", in: "path" } }),
})

export function describeHousehold(household: Household, role: HouseholdRole) {
  return {
    id: household.id,
    name: household.name,
    country: household.country ?? null,
    currency: household.currency ?? null,
    timeZone: household.timeZone,
    weekStartsOn: household.weekStartsOn,
    meals: plannedMeals(household.settings?.meals),
    role,
  }
}

/** A member with their user loaded. */
export function describeMember(member: HouseholdMember) {
  const user = member.user.getEntity()
  return {
    id: member.id,
    userId: user.id,
    name: user.name,
    username: user.displayUsername ?? user.username ?? null,
    role: member.role,
    joinedAt: member.createdAt.toISOString(),
  }
}

export function describeInviteLink(invite: InviteLink) {
  return {
    id: invite.id,
    role: invite.role,
    expiresAt: invite.expiresAt.toISOString(),
    createdAt: invite.createdAt.toISOString(),
  }
}
