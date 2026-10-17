import type { OpenAPIHono } from "@hono/zod-openapi"
import type { AppEnv } from "../../../core/context.ts"
import type { Auth } from "../../../services/auth/auth.ts"
import { AUTH_SESSION, AUTH_USER, IDS, TIMES } from "../../schemas/examples.ts"

type BetterAuthEndpoint = {
  method: "GET" | "POST"
  path: string
  signedIn: boolean
  /** In Merran's words, over what Better Auth says, for the API reference. */
  operationId: string
  summary: string
  description: string
  requestExample?: unknown
  responseExample: unknown
}

const PASSWORD = "correct horse battery staple"

/**
 * The Better Auth endpoints Merran uses, and only those, under /api/auth.
 * Better Auth offers many more (its own member and invitation management,
 * admin tools, social sign-in); they stay shut, so nothing gets around
 * Merran's own rules. A feature that needs one adds it here, and it appears
 * in the API reference.
 */
export const BETTER_AUTH_ENDPOINTS: readonly BetterAuthEndpoint[] = [
  {
    method: "POST",
    path: "/sign-in/username",
    signedIn: false,
    operationId: "signIn",
    summary: "Sign in",
    description:
      "With a username and password. Sets the session cookie that signed-in requests send. Scripts and tools like Home Assistant use an API key instead. Answers in Better Auth's error shape.",
    requestExample: { username: "sam", password: PASSWORD, rememberMe: true },
    responseExample: {
      redirect: false,
      token: AUTH_SESSION.token,
      url: null,
      user: AUTH_USER,
    },
  },
  {
    method: "POST",
    path: "/sign-in/email",
    signedIn: false,
    operationId: "signInWithEmail",
    summary: "Sign in with an email address",
    description:
      "The same as signing in with a username, with the account's email address instead.",
    requestExample: { email: "sam@example.com", password: PASSWORD },
    responseExample: {
      redirect: false,
      token: AUTH_SESSION.token,
      url: null,
      user: AUTH_USER,
    },
  },
  {
    method: "POST",
    path: "/sign-out",
    signedIn: true,
    operationId: "signOut",
    summary: "Sign out",
    description: "Ends this session, and clears its cookie.",
    requestExample: {},
    responseExample: { success: true },
  },
  {
    method: "GET",
    path: "/get-session",
    signedIn: true,
    operationId: "getSession",
    summary: "This session",
    description:
      "Who's signed in, and their session, or null when no one is. `GET /api/auth/me` says more: their households and which one is in use.",
    responseExample: { session: AUTH_SESSION, user: AUTH_USER },
  },
  {
    method: "GET",
    path: "/list-sessions",
    signedIn: true,
    operationId: "listSessions",
    summary: "Where you're signed in",
    description: "Every session you have open: one for each browser or device.",
    responseExample: [AUTH_SESSION],
  },
  {
    method: "POST",
    path: "/revoke-session",
    signedIn: true,
    operationId: "revokeSession",
    summary: "Sign out somewhere",
    description:
      "Ends one of your sessions, named by its token from `GET /api/auth/list-sessions`.",
    requestExample: { token: AUTH_SESSION.token },
    responseExample: { status: true },
  },
  {
    method: "POST",
    path: "/revoke-other-sessions",
    signedIn: true,
    operationId: "revokeOtherSessions",
    summary: "Sign out everywhere else",
    description: "Ends every session you have but this one.",
    requestExample: {},
    responseExample: { status: true },
  },
  {
    method: "POST",
    path: "/revoke-sessions",
    signedIn: true,
    operationId: "revokeAllSessions",
    summary: "Sign out everywhere",
    description: "Ends every session you have, this one too.",
    requestExample: {},
    responseExample: { status: true },
  },
  {
    method: "POST",
    path: "/change-password",
    signedIn: true,
    operationId: "changePassword",
    summary: "Change your password",
    description:
      "Needs your current password. The new one needs at least 10 characters. With `revokeOtherSessions`, everywhere else is signed out too, and a new token comes back for this session.",
    requestExample: {
      currentPassword: PASSWORD,
      newPassword: "a longer, newer passphrase",
      revokeOtherSessions: true,
    },
    responseExample: { token: AUTH_SESSION.token, user: AUTH_USER },
  },
  {
    method: "POST",
    path: "/update-user",
    signedIn: true,
    operationId: "updateProfile",
    summary: "Change your name",
    description: "Your name, username or picture.",
    requestExample: { name: "Sam R." },
    responseExample: { user: { ...AUTH_USER, name: "Sam R." } },
  },
  {
    method: "POST",
    path: "/organization/set-active",
    signedIn: true,
    operationId: "switchHousehold",
    summary: "Switch households",
    description:
      "Makes another of your households the one in use on this device. Better Auth calls households organizations, so it's named by `organizationId`. An API key always works in its own household.",
    requestExample: { organizationId: IDS.household },
    responseExample: {
      id: IDS.household,
      name: "The Riveras",
      slug: "the-riveras",
      logo: null,
      createdAt: TIMES.created,
      metadata: null,
    },
  },
]

/**
 * Hands those endpoints to Better Auth. They answer in Better Auth's own
 * error shape, not Merran's.
 */
export function mountBetterAuth(router: OpenAPIHono<AppEnv>, auth: Auth) {
  for (const { method, path } of BETTER_AUTH_ENDPOINTS) {
    router.on(method, `/auth${path}`, (c) => auth.handler(c.req.raw))
  }
}
