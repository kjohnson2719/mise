import { createRoute, z } from "@hono/zod-openapi"
import { streamSSE } from "hono/streaming"
import type { AppDeps } from "../../../core/context.ts"
import {
  LIVE_AREAS,
  LIVE_PAGES,
  type LiveEvent,
} from "../../../services/events/events.ts"
import { OPEN_TO_READERS, readingHousehold } from "../../middleware/auth.ts"
import type { Router } from "../../router.ts"
import { SIGNED_IN_ERRORS } from "../../schemas/responses.ts"

/** Keeps the connection open through proxies, which close quiet ones. */
const PING_MS = 25_000

const route = createRoute({
  method: "get",
  path: "/events",
  operationId: "streamEvents",
  tags: ["Live"],
  summary: "What changes, as it happens",
  description: [
    "Server-sent events for the household, for as long as the connection stays open:",
    "",
    "- `ready` when it's open, with the areas it hears about.",
    "- `plan`, `list`, `pantry`, `recipes` or `household` when something there changes, with who changed it (`by`). Fetch the area again to see what.",
    "- `presence` with who has `page` open, when someone opens or leaves it.",
    "- `ping` now and then, to keep the connection open.",
    "",
    "A device that sends the same `client` with its own changes (in the `X-Merran-Client` header) isn't told about them; your other devices are. An API key hears about the areas it can read.",
  ].join("\n"),
  ...OPEN_TO_READERS,
  request: {
    query: z.object({
      page: z.enum(LIVE_PAGES).optional().openapi({
        description: "The page open, to say who else has it open.",
      }),
      client: z.string().max(64).optional().openapi({
        description: "This device's id, as sent with its changes.",
      }),
    }),
  },
  responses: {
    200: {
      description: "The events, until the connection closes.",
      content: { "text/event-stream": { schema: z.string() } },
    },
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, { events }: AppDeps) => {
  router.openapi(route, (c) => {
    const { householdId, user, apiKey, readable } = readingHousehold(
      c,
      LIVE_AREAS
    )
    const { page, client } = c.req.valid("query")
    c.header("Cache-Control", "no-cache, no-transform")
    // Nginx would hold the events back otherwise.
    c.header("X-Accel-Buffering", "no")
    return streamSSE(c, async (stream) => {
      let open = true
      const send = (event: LiveEvent) => {
        if (!open) return
        const { type, ...data } = event
        const name = type === "changed" ? event.area : type
        void stream
          .writeSSE({
            event: name,
            data: JSON.stringify(
              type === "changed" ? { area: event.area, by: event.by } : data
            ),
          })
          .catch(() => {
            open = false
          })
      }
      let wake: () => void = () => {}
      const hangUp = () => {
        open = false
        wake()
      }
      // Gone as soon as the page closes, so "on the list too" doesn't linger.
      stream.onAbort(hangUp)
      c.req.raw.signal.addEventListener("abort", hangUp)
      // Ready first, so presence and changes come after it.
      await stream.writeSSE({
        event: "ready",
        data: JSON.stringify({ areas: readable }),
      })
      const stop = events.subscribe(householdId, {
        // A key isn't a person with a page open.
        person: apiKey ? null : { id: user.id, name: user.name },
        client: client ?? null,
        page: apiKey ? null : (page ?? null),
        areas: new Set(readable),
        send,
        close: hangUp,
      })
      try {
        while (open && !stream.aborted) {
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, PING_MS)
            wake = () => {
              clearTimeout(timer)
              resolve()
            }
          })
          if (open && !stream.aborted)
            await stream.writeSSE({ event: "ping", data: "" })
        }
      } catch {
        // The page went away.
      } finally {
        open = false
        stop()
      }
    }) as never
  })
}
