import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../core/context.ts"
import { SAMPLE, speak } from "../../../../../../services/voice/voice.ts"
import { inHousehold, serverAdmin } from "../../../../../middleware/auth.ts"
import type { Router } from "../../../../../router.ts"
import {
  errorResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../../schemas/responses.ts"
import {
  MP3_RESPONSE,
  VoicePreviewSchema,
} from "../../../../../schemas/voice.ts"

const route = createRoute({
  method: "post",
  path: "/settings/server/voice/preview",
  operationId: "previewVoice",
  tags: ["Settings"],
  summary: "Hear a voice",
  description:
    "Server admins only. A sample cook step read in any Kokoro or OpenAI voice, before it's picked: made once and kept. OpenAI's is on an OpenAI key of the admin's household, a fraction of a cent the first time.",
  security: SESSION_SECURITY,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: VoicePreviewSchema } },
    },
  },
  responses: {
    200: MP3_RESPONSE,
    422: errorResponse("Kokoro didn't answer, or there's no OpenAI key."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    serverAdmin(c)
    const { em, householdId, userId } = inHousehold(c)
    const trying = c.req.valid("json")
    const sound = await speak(deps, em, {
      householdId,
      userId,
      text: SAMPLE,
      trying,
    })
    c.header("Content-Type", "audio/mpeg")
    return c.body(new Uint8Array(sound), 200)
  })
}
