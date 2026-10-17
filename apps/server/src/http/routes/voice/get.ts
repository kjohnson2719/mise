import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../core/context.ts"
import { voiceFor } from "../../../services/voice/voice.ts"
import { inHousehold, openToKeys } from "../../middleware/auth.ts"
import type { Router } from "../../router.ts"
import { jsonResponse, SIGNED_IN_ERRORS } from "../../schemas/responses.ts"
import { HouseholdVoiceSchema } from "../../schemas/voice.ts"

const route = createRoute({
  method: "get",
  path: "/voice",
  operationId: "getVoice",
  tags: ["Voice"],
  summary: "Whether the server reads aloud",
  description:
    "For the cook view: whether the server reads steps aloud for the household (Kokoro, or OpenAI on one of its keys), or each device reads in its own voice.",
  ...openToKeys("recipes", "read"),
  responses: {
    200: jsonResponse(HouseholdVoiceSchema, "The household's voice."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    return c.json(await voiceFor(deps, em, householdId), 200)
  })
}
