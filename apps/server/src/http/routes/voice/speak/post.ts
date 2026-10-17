import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { speak } from "../../../../services/voice/voice.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { errorResponse, SIGNED_IN_ERRORS } from "../../../schemas/responses.ts"
import { MP3_RESPONSE, SpeakSchema } from "../../../schemas/voice.ts"

const route = createRoute({
  method: "post",
  path: "/voice/speak",
  operationId: "speak",
  tags: ["Voice"],
  summary: "Read some text aloud",
  description:
    "In the server's voice, as MP3: a cook step, an amount, a timer. Each piece of text is read once per voice and kept, so it's never paid for twice. When the server doesn't read aloud for the household, it says so, and the device reads in its own voice.",
  ...openToKeys("recipes", "read"),
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: SpeakSchema } },
    },
  },
  responses: {
    200: MP3_RESPONSE,
    422: errorResponse("The server doesn't read aloud for the household."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = inHousehold(c)
    const sound = await speak(deps, em, {
      householdId,
      userId,
      text: c.req.valid("json").text,
    })
    c.header("Content-Type", "audio/mpeg")
    c.header("Cache-Control", "private, max-age=86400")
    return c.body(new Uint8Array(sound), 200)
  })
}
