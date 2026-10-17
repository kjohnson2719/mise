import { createRoute, z } from "@hono/zod-openapi"
import type { Context } from "hono"
import { bodyLimit } from "hono/body-limit"
import type { AppDeps, AppEnv } from "../../../core/context.ts"
import { AppError } from "../../../core/errors.ts"
import type { Shared, SharedFile } from "../../../services/share/links.ts"
import { shareToMerran } from "../../../services/share/share.ts"
import { inHousehold, openToKeys } from "../../middleware/auth.ts"
import type { Router } from "../../router.ts"
import { IDS } from "../../schemas/examples.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../schemas/responses.ts"

/** Photos, a web page or two: more than a share of a link needs. */
const MAX_SHARE_BYTES = 25_000_000

const SharedTextSchema = z
  .object({
    title: z.string().optional(),
    text: z.string().optional(),
    url: z.string().optional(),
  })
  .openapi("SharedText", {
    example: {
      title: "Lemon Chicken",
      text: "Making this tonight! https://example.com/lemon-chicken",
    },
  })

const SharedFormSchema = z.object({
  title: z.string().optional(),
  text: z.string().optional(),
  url: z.string().optional(),
  file: z.any().optional().openapi({
    type: "string",
    format: "binary",
    description:
      "What was shared, as a file: a text file with the link, a .webloc, the web page, or a photo of a recipe. Several photos come as several `file` fields.",
  }),
})

const ShareOutcomeSchema = z
  .object({
    outcome: z
      .enum(["added", "already", "importing", "receipt", "failed"])
      .openapi({
        description:
          "Added; already in the library (this is that recipe); several links, now importing in the background; a receipt, read and waiting for a look before it goes in the pantry; or not added.",
      }),
    code: z.string().nullable().openapi({
      description:
        'Why it wasn\'t added, for programs: "no_recipe", "no_recipe_data", "ai_noKey" and the like.',
    }),
    message: z.string().openapi({
      description: "What happened, in words to show, as a Shortcut does.",
      example: "Added Lemon Chicken to Merran.",
    }),
    recipe: z
      .object({ id: z.string(), slug: z.string(), name: z.string() })
      .nullable(),
    receiptId: z.string().nullable().openapi({
      description:
        "A receipt: the one to look over, at /pantry/receipts/{receiptId}.",
    }),
    importId: z.string().nullable().openapi({
      description:
        "Several links: the import, to follow at /recipes/import/links/{importId}.",
    }),
    url: z
      .string()
      .nullable()
      .openapi({ description: "The recipe's page, or the import's." }),
  })
  .openapi("ShareOutcome", {
    example: {
      outcome: "added",
      code: null,
      message: "Added Lemon Chicken to Merran.",
      recipe: {
        id: IDS.lemonChicken,
        slug: "lemon-chicken",
        name: "Lemon Chicken",
      },
      importId: null,
      receiptId: null,
      url: "https://merran.example.com/recipes/lemon-chicken",
    },
  })

const keys = openToKeys("imports", "write")

const route = createRoute({
  method: "post",
  path: "/share",
  operationId: "shareToMerran",
  tags: ["Recipes"],
  summary: "Share something to Merran",
  description:
    "What Android's share sheet and the iPhone Shortcut send. A link to a recipe, as text, a form, JSON, or a file with the link in it (a text file, a .webloc, or the web page itself), is added as a recipe; several links start an import in the background. Without a link, photos, a PDF or text are read by AI: a receipt waits to be looked over for the pantry (`GET /pantry/receipts/{receiptId}`), and a recipe (up to 4 photos, as one) is added, when the household has AI for receipts and importing. It answers with what happened, in words a Shortcut can show, rather than an error when the link couldn't be added.",
  ...keys,
  middleware: [
    ...keys.middleware,
    bodyLimit({
      maxSize: MAX_SHARE_BYTES,
      onError: () => {
        throw new AppError(
          "too_large",
          "share_too_large",
          "That's too big to share."
        )
      },
    }),
  ] as const,
  request: {
    body: {
      required: true,
      content: {
        "multipart/form-data": { schema: SharedFormSchema },
        "application/json": { schema: SharedTextSchema },
        "text/plain": { schema: z.string() },
      },
    },
  },
  responses: {
    201: jsonResponse(ShareOutcomeSchema, "Added."),
    202: jsonResponse(ShareOutcomeSchema, "Several links, importing."),
    200: jsonResponse(ShareOutcomeSchema, "Already there, or not added."),
    413: errorResponse("Too big to share."),
    ...SIGNED_IN_ERRORS,
  },
})

/**
 * What was shared, however it came: a form with files and text, JSON with
 * text and a link, text, or a file as the whole body.
 */
async function readShared(c: Context<AppEnv>): Promise<Shared> {
  const type = (c.req.header("content-type") ?? "").toLowerCase()
  const files: SharedFile[] = []
  const texts: string[] = []
  const addText = (value: unknown) => {
    if (typeof value === "string" && value.trim()) texts.push(value.trim())
  }
  if (type.startsWith("application/json")) {
    const body = (await c.req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >
    for (const key of ["title", "text", "url"]) addText(body[key])
  } else if (
    type.startsWith("multipart/form-data") ||
    type.startsWith("application/x-www-form-urlencoded")
  ) {
    const body = await c.req.parseBody({ all: true })
    for (const key of ["title", "text", "url", "file", "files"]) {
      for (const value of [body[key]].flat()) {
        if (value instanceof File) {
          files.push({
            body: Buffer.from(await value.arrayBuffer()),
            type: value.type,
            name: value.name,
          })
        } else {
          addText(value)
        }
      }
    }
  } else {
    const body = Buffer.from(await c.req.arrayBuffer())
    if (type.startsWith("text/")) addText(body.toString("utf8"))
    else if (body.length > 0) files.push({ body, type, name: "" })
  }
  return { files, text: texts.join("\n") || null }
}

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = inHousehold(c)
    const result = await shareToMerran(em, deps, {
      householdId,
      userId,
      shared: await readShared(c),
      baseUrl: deps.config.publicUrl ?? new URL(c.req.url).origin,
    })
    const status =
      result.outcome === "added"
        ? 201
        : result.outcome === "importing"
          ? 202
          : 200
    return c.json(result, status)
  })
}
