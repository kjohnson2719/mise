import { createRoute, z } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { exportMyData } from "../../../../../services/transfer/my-data.ts"
import { signedIn } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { KEY_PERMISSIONS, TIMES } from "../../../../schemas/examples.ts"
import {
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const MyDataSchema = z
  .object({
    format: z.literal("merran.person"),
    version: z.number(),
    exportedAt: z.iso.datetime(),
    account: z.object({
      name: z.string(),
      email: z.string(),
      username: z.string().nullable(),
      createdAt: z.iso.datetime(),
      preferences: z.record(z.string(), z.unknown()),
    }),
    households: z.array(
      z.object({
        name: z.string(),
        role: z.string(),
        joinedAt: z.iso.datetime(),
      })
    ),
    cookingNotes: z.array(
      z.object({
        household: z.string(),
        recipe: z.string(),
        rating: z.number().nullable(),
        note: z.string().nullable(),
        createdAt: z.iso.datetime(),
      })
    ),
    apiKeys: z.array(
      z.object({
        name: z.string(),
        household: z.string(),
        permissions: z.record(z.string(), z.string()),
        createdAt: z.iso.datetime(),
        lastUsedAt: z.iso.datetime().nullable(),
        expiresAt: z.iso.datetime().nullable(),
      })
    ),
  })
  .openapi("MyData", {
    example: {
      format: "merran.person",
      version: 1,
      exportedAt: TIMES.now,
      account: {
        name: "Sam Rivera",
        email: "sam@example.com",
        username: "sam",
        createdAt: TIMES.created,
        preferences: {},
      },
      households: [
        { name: "The Riveras", role: "owner", joinedAt: TIMES.created },
      ],
      cookingNotes: [
        {
          household: "The Riveras",
          recipe: "Lemon Chicken",
          rating: 5,
          note: "More lemon next time.",
          createdAt: TIMES.lastMade,
        },
      ],
      apiKeys: [
        {
          name: "Home Assistant",
          household: "The Riveras",
          permissions: KEY_PERMISSIONS,
          createdAt: TIMES.created,
          lastUsedAt: TIMES.now,
          expiresAt: TIMES.inThreeMonths,
        },
      ],
    },
  })

const route = createRoute({
  method: "get",
  path: "/auth/me/export",
  operationId: "exportMyData",
  tags: ["Auth"],
  summary: "Export your data",
  description:
    "Your account, the households you're in, the cooking notes you wrote, and your API keys (never the keys themselves), as a JSON file to keep. A household's recipes are in the household's export.",
  security: SESSION_SECURITY,
  responses: {
    200: jsonResponse(MyDataSchema, "Your data, to download."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { user } = signedIn(c)
    const day = new Date().toISOString().slice(0, 10)
    c.header(
      "Content-Disposition",
      `attachment; filename="merran-my-data-${day}.json"`
    )
    c.header("Cache-Control", "no-store")
    return c.json(await exportMyData(c.var.em, user.id), 200)
  })
}
