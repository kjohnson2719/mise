import { createRoute, z } from "@hono/zod-openapi"
import { bodyLimit } from "hono/body-limit"
import type { AppDeps } from "../../../../../core/context.ts"
import { AppError } from "../../../../../core/errors.ts"
import { importReadPage } from "../../../../../services/recipes/import/import-link.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { ImportResultSchema } from "../../../../schemas/recipes.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

/** A page's recipe data, photos and text: a few hundred KB at most. */
const MAX_BYTES = 2_000_000

const keys = openToKeys("imports", "write")

const ReadPageSchema = z
  .object({
    url: z.string().trim().min(1).max(2000),
    title: z.string().max(500).default(""),
    jsonld: z
      .array(z.string().max(400_000))
      .max(20)
      .default([])
      .openapi({ description: "The page's JSON-LD blocks, as found." }),
    images: z
      .array(z.string().max(2000))
      .max(10)
      .default([])
      .openapi({ description: "Its share images: og:image and the like." }),
    text: z
      .string()
      .max(100_000)
      .default("")
      .openapi({ description: "Its text, as the browser shows it." }),
  })
  .openapi("ReadPage", {
    example: {
      url: "https://cooking.example/lemon-chicken",
      title: "Lemon Chicken | Cooking",
      jsonld: ['{"@type":"Recipe","name":"Lemon Chicken"}'],
      images: ["https://cooking.example/lemon-chicken.jpg"],
      text: "Lemon Chicken. Serves 4. 4 chicken thighs, 2 lemons...",
    },
  })

const route = createRoute({
  method: "post",
  path: "/recipes/import/page",
  operationId: "importReadPage",
  tags: ["Recipes"],
  summary: "Add a recipe from a page already open",
  description:
    "For the browser extension: a page as the person's own browser shows it, for sites that turn Merran's server away or only show a recipe to someone signed in. Its recipe data and photo, or its text read by AI when the household has AI for importing. A video's page (YouTube, TikTok, Instagram, Facebook) is imported as the video, as `POST /recipes/import` does. A page imported before gives back that recipe.",
  ...keys,
  middleware: [
    ...keys.middleware,
    bodyLimit({
      maxSize: MAX_BYTES,
      onError: () => {
        throw new AppError(
          "too_large",
          "page_too_large",
          "That page is too big to send."
        )
      },
    }),
  ] as const,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: ReadPageSchema } },
    },
  },
  responses: {
    201: jsonResponse(ImportResultSchema, "Added."),
    200: jsonResponse(ImportResultSchema, "Already in the library."),
    400: errorResponse("Not a link Merran can keep."),
    413: errorResponse("The page is over 2 MB."),
    422: errorResponse(
      "The page has no recipe data and no AI to read it, or AI found no recipe on it."
    ),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = inHousehold(c)
    const result = await importReadPage(em, deps, {
      householdId,
      userId,
      page: c.req.valid("json"),
    })
    return c.json(result, result.duplicate ? 200 : 201)
  })
}
