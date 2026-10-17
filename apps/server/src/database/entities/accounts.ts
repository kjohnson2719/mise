import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { createdAt, id, updatedAt } from "./base.ts"
import { User } from "./users.ts"

/** A way to sign in, a password or a single sign-on provider: Better Auth's account. */
export const Account = defineEntity({
  name: "Account",
  tableName: "accounts",
  properties: {
    id: id(),
    accountId: p.string(),
    providerId: p.string(),
    user: () => p.manyToOne(User).ref().deleteRule("cascade").index(),
    accessToken: p.text().nullable(),
    refreshToken: p.text().nullable(),
    idToken: p.text().nullable(),
    accessTokenExpiresAt: p.datetime().nullable(),
    refreshTokenExpiresAt: p.datetime().nullable(),
    scope: p.string().nullable(),
    password: p.string().nullable(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
})
export type Account = InferEntity<typeof Account>
