import type { EntityManager } from "@mikro-orm/sql"
import { User } from "../../database/entities/index.ts"
import { AppError } from "../../core/errors.ts"
import type { Auth } from "./auth.ts"

export type NewAccount = {
  name: string
  email: string
  username: string
  password: string
}

/**
 * Makes a person's account with a password. Sign-up is closed in Better
 * Auth, so setup, invite links and household admins make accounts here.
 */
export async function createAccount(
  auth: Auth,
  em: EntityManager,
  account: NewAccount,
  options: { serverAdmin?: boolean } = {}
) {
  const email = account.email.trim().toLowerCase()
  const username = account.username.trim().toLowerCase()

  const taken = await em.findOne(User, {
    $or: [{ email }, { username }],
  })
  if (taken) {
    throw new AppError(
      "conflict",
      "account_exists",
      taken.email === email
        ? "There's already an account with that email."
        : "That username is taken.",
      taken.email === email
        ? { email: "Already in use." }
        : { username: "Already taken." }
    )
  }

  const context = await auth.$context
  const user = await context.internalAdapter.createUser(
    {
      name: account.name.trim(),
      email,
      username,
      displayUsername: account.username.trim(),
      role: options.serverAdmin ? "admin" : "user",
    },
    { method: "admin" }
  )
  await context.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: await context.password.hash(account.password),
  })
  return user
}

/**
 * Signs a person in, as if they'd used the sign-in form, and returns the
 * session cookie to send back.
 */
export async function signInCookies(
  auth: Auth,
  { username, password }: { username: string; password: string },
  request: Request
): Promise<string[]> {
  const res = await auth.api.signInUsername({
    body: { username: username.trim().toLowerCase(), password },
    headers: request.headers,
    asResponse: true,
  })
  if (!res.ok) {
    throw new AppError(
      "internal",
      "internal",
      "The account was made, but signing in failed."
    )
  }
  return res.headers.getSetCookie()
}
