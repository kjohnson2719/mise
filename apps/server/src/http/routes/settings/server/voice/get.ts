import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { voiceSettings } from "../../../../../services/voice/voice.ts"
import { serverAdmin } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"
import { VoiceSettingsSchema } from "../../../../schemas/voice.ts"

const route = createRoute({
  method: "get",
  path: "/settings/server/voice",
  operationId: "getVoiceSettings",
  tags: ["Settings"],
  summary: "The server voice",
  description:
    "Server admins only. Who reads aloud, Kokoro's address, the voice picked for each, and the voices Kokoro and OpenAI have. Change them at `PATCH /settings/server` (`voice.*`).",
  security: SESSION_SECURITY,
  responses: {
    200: jsonResponse(VoiceSettingsSchema, "The server voice."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    serverAdmin(c)
    return c.json(await voiceSettings(deps), 200)
  })
}
