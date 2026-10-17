import { betterAuth } from "better-auth"
import type { Logger } from "pino"
import { admin, openAPI, organization, username } from "better-auth/plugins"
import { v7 as uuidv7 } from "uuid"
import type { Config } from "../../core/config.ts"
import type { Database } from "../../database/orm.ts"
import { membershipsOf } from "../households.ts"

export const AUTH_BASE = "/api/auth"

/**
 * Where Better Auth finds the client's address. Set by Merran's own
 * middleware, never believed from the client.
 */
export const CLIENT_ADDRESS_HEADER = "x-merran-client-ip"

/** Sessions last 90 days from their last use, so the kitchen tablet stays signed in. */
const SESSION_DAYS = 90

/** Better Auth's camelCase field names, as the snake_case columns MikroORM made. */
function snake(...fields: string[]): Record<string, string> {
  return Object.fromEntries(
    fields.map((field) => [
      field,
      field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
    ])
  )
}

export type AuthOptions = {
  config: Pick<Config, "database" | "publicUrl">
  database: Database
  secret: string
  /** Where Better Auth's own messages go. Without it, they're printed plainly. */
  logger?: Logger
}

/**
 * Better Auth, on Merran's own tables. MikroORM defines and migrates them
 * (src/database/entities); Better Auth reads and writes them through the same
 * connection, with each table and column named here.
 */
export function createAuth({ config, database, secret, logger }: AuthOptions) {
  const log = logger?.child({ source: "better-auth" })
  return betterAuth({
    appName: "Merran",
    basePath: AUTH_BASE,
    ...(config.publicUrl ? { baseURL: config.publicUrl } : {}),
    secret,
    ...(log
      ? {
          logger: {
            log: (level, message, ...args) =>
              log[level](args.length > 0 ? { details: args } : {}, message),
          },
        }
      : {}),
    database: {
      db: database.em.getKysely(),
      type: config.database.kind,
      transaction: true,
    },
    // Better Auth's anonymous usage reports. Off by default; kept off here
    // so it's plain to anyone reading this that nothing is sent.
    telemetry: { enabled: false },
    advanced: {
      cookiePrefix: "merran",
      // Rate limits go by the address Merran works out, never one a client
      // sends (see http/middleware/client-address.ts).
      ipAddress: { ipAddressHeaders: [CLIENT_ADDRESS_HEADER] },
      database: { generateId: () => uuidv7() },
    },
    emailAndPassword: {
      enabled: true,
      // Accounts are made by setup, invite links and household admins, not
      // by anyone who finds the sign-up endpoint.
      disableSignUp: true,
      minPasswordLength: 10,
    },
    rateLimit: {
      // Better Auth only turns this on when NODE_ENV is "production".
      enabled: true,
      storage: "database",
      modelName: "rate_limits",
      fields: snake("lastRequest"),
    },
    user: {
      modelName: "users",
      fields: snake("emailVerified", "createdAt", "updatedAt"),
    },
    session: {
      modelName: "sessions",
      fields: snake(
        "expiresAt",
        "createdAt",
        "updatedAt",
        "ipAddress",
        "userAgent",
        "userId"
      ),
      expiresIn: SESSION_DAYS * 24 * 60 * 60,
      updateAge: 24 * 60 * 60,
    },
    account: {
      modelName: "accounts",
      fields: snake(
        "accountId",
        "providerId",
        "userId",
        "accessToken",
        "refreshToken",
        "idToken",
        "accessTokenExpiresAt",
        "refreshTokenExpiresAt",
        "createdAt",
        "updatedAt"
      ),
    },
    verification: {
      modelName: "verifications",
      fields: snake("expiresAt", "createdAt", "updatedAt"),
    },
    databaseHooks: {
      session: {
        create: {
          // A new sign-in starts in the person's first household.
          before: async (session) => {
            const active = (session as { activeOrganizationId?: string | null })
              .activeOrganizationId
            if (active) return
            const [first] = await membershipsOf(
              database.em.fork(),
              session.userId
            )
            return {
              data: {
                ...session,
                activeOrganizationId: first?.household.id ?? null,
              },
            }
          },
        },
      },
    },
    plugins: [
      // Describes Better Auth's endpoints for Merran's own API reference.
      openAPI({ disableDefaultReference: true }),
      username({
        schema: { user: { fields: snake("displayUsername") } },
      }),
      admin({
        schema: {
          user: { fields: snake("banReason", "banExpires") },
          session: { fields: snake("impersonatedBy") },
        },
      }),
      organization({
        // Households are made by Merran's own routes, with its own rules.
        allowUserToCreateOrganization: false,
        schema: {
          organization: {
            modelName: "households",
            fields: snake("createdAt"),
          },
          member: {
            modelName: "household_members",
            fields: {
              organizationId: "household_id",
              ...snake("userId", "createdAt"),
            },
          },
          invitation: {
            modelName: "email_invitations",
            fields: {
              organizationId: "household_id",
              inviterId: "inviter_id",
              ...snake("expiresAt", "createdAt"),
            },
          },
          session: {
            fields: { activeOrganizationId: "active_household_id" },
          },
        },
      }),
    ],
  })
}

export type Auth = ReturnType<typeof createAuth>
