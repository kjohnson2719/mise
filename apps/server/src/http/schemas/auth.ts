import { z } from "@hono/zod-openapi"
import type { EntityManager } from "@mikro-orm/sql"
import { HOUSEHOLD_ROLES, INVITE_ROLES } from "../../database/entities/index.ts"
import { membershipsOf } from "../../services/households.ts"
import { ME, NEW_ACCOUNT, TIMES } from "./examples.ts"

/** A new account's details. The same rules as Better Auth's username plugin. */
export const NewAccountSchema = z
  .object({
    name: z.string().trim().min(1, "Enter a name.").max(100),
    email: z.email("Enter an email address."),
    username: z
      .string()
      .trim()
      .min(3, "Use at least 3 characters.")
      .max(30, "Use at most 30 characters.")
      .regex(/^[a-zA-Z0-9_.]+$/, "Use letters, numbers, dots and underscores."),
    password: z
      .string()
      .min(10, "Use at least 10 characters.")
      .max(128, "Use at most 128 characters."),
  })
  .openapi("NewAccount", { example: NEW_ACCOUNT })

export type NewAccount = z.infer<typeof NewAccountSchema>

export const MeSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    username: z.string().nullable(),
    serverAdmin: z.boolean(),
    households: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        role: z.enum(HOUSEHOLD_ROLES),
      })
    ),
    /** The household in use on this device. */
    activeHouseholdId: z.string().nullable(),
  })
  .openapi("Me", { example: ME })

export type Me = z.infer<typeof MeSchema>

export async function describeMe(
  em: EntityManager,
  user: {
    id: string
    name: string
    email: string
    username?: string | null
    role?: string | null
  },
  activeHouseholdId: string | null
): Promise<Me> {
  const memberships = await membershipsOf(em, user.id)
  const households = memberships.map((member) => ({
    id: member.household.id,
    name: member.household.getEntity().name,
    role: member.role,
  }))
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    username: user.username ?? null,
    serverAdmin: user.role === "admin",
    households,
    activeHouseholdId: households.some((h) => h.id === activeHouseholdId)
      ? activeHouseholdId
      : (households[0]?.id ?? null),
  }
}

export const InviteTokenParam = z.object({
  token: z.string().openapi({ param: { name: "token", in: "path" } }),
})

export const InviteSchema = z
  .object({
    household: z.object({ name: z.string() }),
    role: z.enum(INVITE_ROLES),
    expiresAt: z.iso.datetime(),
  })
  .openapi("Invite", {
    example: {
      household: { name: "The Riveras" },
      role: "member",
      expiresAt: TIMES.inAWeek,
    },
  })
