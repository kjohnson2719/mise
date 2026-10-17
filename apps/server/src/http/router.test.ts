import { createRoute, z } from "@hono/zod-openapi"
import { pino } from "pino"
import { describe, expect, test } from "vitest"
import { AppError } from "../core/errors.ts"
import { handleError } from "./errors.ts"
import { requestLogger } from "./middleware/request-logger.ts"
import { createRouter } from "./router.ts"

const echo = createRoute({
  method: "get",
  path: "/echo",
  request: {
    query: z.object({ count: z.coerce.number().int().min(1) }),
  },
  responses: {
    200: {
      description: "The count back.",
      content: {
        "application/json": { schema: z.object({ count: z.number() }) },
      },
    },
  },
})

function testRouter() {
  const router = createRouter()
  router.use(requestLogger(pino({ level: "silent" })))
  router.openapi(echo, (c) =>
    c.json({ count: c.req.valid("query").count }, 200)
  )
  router.get("/refused", () => {
    throw new AppError(
      "conflict",
      "already_there",
      "That's already in the library."
    )
  })
  router.get("/broken", () => {
    throw new Error("a bug, with details people shouldn't see")
  })
  router.onError(handleError)
  return router
}

describe("routers", () => {
  test("valid input reaches the handler", async () => {
    const res = await testRouter().request("/echo?count=3")

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ count: 3 })
  })

  test("invalid input gets the standard error, with a message per field", async () => {
    const res = await testRouter().request("/echo?count=zero")

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      error: {
        code: "invalid_request",
        message: expect.any(String),
        fields: { count: expect.any(String) },
      },
    })
  })

  test("an AppError keeps its status, code and message", async () => {
    const res = await testRouter().request("/refused")

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      error: {
        code: "already_there",
        message: "That's already in the library.",
      },
    })
  })

  test("anything else is a plain 500 that gives nothing away", async () => {
    const res = await testRouter().request("/broken")
    const body = await res.text()

    expect(res.status).toBe(500)
    expect(JSON.parse(body)).toEqual({
      error: { code: "internal", message: expect.any(String) },
    })
    expect(body).not.toContain("a bug")
  })
})
