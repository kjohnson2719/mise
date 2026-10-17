import type { OpenAPIHono } from "@hono/zod-openapi"
import type { AppEnv } from "../../core/context.ts"
import { AUTH_BASE, type Auth } from "../../services/auth/auth.ts"
import { KEY_PERMISSION } from "../middleware/auth.ts"
import { BETTER_AUTH_ENDPOINTS } from "../routes/auth/better-auth.ts"

type Document = ReturnType<OpenAPIHono<AppEnv>["getOpenAPI31Document"]>
type Operation = Record<string, unknown>

/** Where the published spec says to send requests, until someone sets their own. */
export const DEFAULT_SERVER_URL = "http://localhost:3000"

const TAGS = [
  {
    name: "Sign-in",
    description:
      "Setting up the server, signing in and out, invite links and switching households. Signed-in requests carry the session cookie.",
  },
  {
    name: "API keys",
    description:
      "Keys for scripts and tools like Home Assistant. Each acts as its person in one household, with only the permissions it was given, and stops working if it expires, is revoked, or its person leaves the household.",
  },
  {
    name: "Households",
    description:
      "The household in use: its settings, its people and their roles, and invite links.",
  },
  {
    name: "Recipes",
    description:
      "The household's recipes, their tags and versions, and Recently deleted. Ingredients and steps are written as lines, as in the editor, and each ingredient line is read into its amount, unit, food and note.",
  },
  {
    name: "Review",
    description:
      "What AI suggests, waiting to be applied or dismissed: tidy ups of recipes, for now. AI never changes a recipe by itself. Each section of a suggestion is applied or skipped on its own, and applying keeps a version.",
  },
  {
    name: "Assistant",
    description:
      "Chatting with the assistant, which knows the household's recipes, plan, list and pantry, and proposes changes rather than making them. Each person's chats are their own.",
  },
  {
    name: "Discover",
    description:
      "Finding new recipes online for a theme, with AI and web search: pages Merran has opened and can import.",
  },
  {
    name: "Collections",
    description:
      "Starter collections: sets of recipes to start a library with, each filled by its rule from the recipe sites Merran reads, around a few hand-picked classics.",
  },
  {
    name: "Sites",
    description:
      "Recipe sites a household follows, and their newest recipes, read in the background as Merran, following robots.txt.",
  },
  {
    name: "Plan",
    description:
      "The week plan: meals on days and in the week's pool, what's next, and Fill the week's ideas, each saying why. Today is always the household's, in its time zone.",
  },
  {
    name: "List",
    description:
      "The shopping list, by aisle: from the plan (added up, and following the plan when meals change), typed in, or every week. Changes say what things were before, for Undo.",
  },
  {
    name: "Pantry",
    description:
      "What's at home, in the fridge, the freezer and the cupboard: what to use soon, and what's set aside for planned meals. Shopping put away goes in, and cooking a planned meal uses it up.",
  },
  {
    name: "Live",
    description:
      "What changes in the household, as it happens: the live updates the app uses, and who has the list open.",
  },
  {
    name: "Stores",
    description:
      "Stores with an API: Kroger (Fry's, Ralphs...), its products and prices, and sending the list to a linked account's cart.",
  },
  {
    name: "Voice",
    description:
      "The server voice: cook steps read aloud by Kokoro or OpenAI, the same on every device.",
  },
  {
    name: "Settings",
    description:
      "Settings for the server (its admin only) and the household in use. A setting from an environment variable is locked, and a secret is never sent back: only whether it's set, and its last four characters.",
  },
  {
    name: "Server",
    description:
      "Whether the server is up and ready, and which of Merran's optional parts are on. No sign-in needed.",
  },
]

/**
 * The whole API as one OpenAPI 3.1 document: Merran's routes, plus the
 * Better Auth endpoints Merran exposes, described by Better Auth itself.
 * The same document is served at /api/openapi.json and saved as
 * openapi.json for docs sites.
 */
export async function buildOpenApiDocument(
  app: OpenAPIHono<AppEnv>,
  auth: Auth,
  { version, serverUrl }: { version: string; serverUrl: string }
): Promise<Document> {
  const document = app.getOpenAPI31Document({
    openapi: "3.1.0",
    info: {
      title: "Merran API",
      version,
      description:
        "Everything the Merran app does, it does through this API: the same routes are open to scripts and to tools like Home Assistant. Tools use an API key: make one at `POST /api/auth/api-keys` while signed in, then send it as `Authorization: Bearer mrn_…`. Each route a key can use says which permission it needs, in `x-merran-permission` (like `recipes:read`); routes without it refuse keys. Browsers sign in with `POST /api/auth/sign-in/username` and send the session cookie it sets.",
      license: {
        name: "AGPL-3.0-or-later",
        url: "https://www.gnu.org/licenses/agpl-3.0.html",
      },
    },
    servers: [
      {
        url: "{server}",
        description: "Your Merran",
        variables: {
          server: {
            default: serverUrl,
            description: "The address you reach Merran at",
          },
        },
      },
    ],
    tags: TAGS,
  })

  const betterAuth = (await auth.api.generateOpenAPISchema()) as unknown as {
    paths: Record<string, Record<string, Operation>>
    components?: { schemas?: Record<string, unknown> }
  }
  document.paths ??= {}
  const added: Operation[] = []
  for (const endpoint of BETTER_AUTH_ENDPOINTS) {
    const { method, path, signedIn } = endpoint
    const verb = method.toLowerCase()
    const operation = betterAuth.paths[path]?.[verb]
    if (!operation) {
      throw new Error(`Better Auth doesn't describe ${method} ${path}`)
    }
    const described = {
      ...withExamples(operation, endpoint),
      operationId: endpoint.operationId,
      summary: endpoint.summary,
      description: endpoint.description,
      tags: ["Sign-in"],
      ...(signedIn ? { security: [{ session: [] }] } : {}),
    }
    document.paths[`${AUTH_BASE}${path}`] = {
      ...document.paths[`${AUTH_BASE}${path}`],
      [verb]: described,
    }
    added.push(described)
  }

  // Bring along only the schemas those endpoints refer to.
  const referenced = JSON.stringify(added)
  document.components ??= {}
  document.components.schemas ??= {}
  for (const [name, schema] of Object.entries(
    betterAuth.components?.schemas ?? {}
  )) {
    if (!referenced.includes(`"#/components/schemas/${name}"`)) continue
    if (name in document.components.schemas) {
      throw new Error(`Better Auth's ${name} schema clashes with Merran's`)
    }
    document.components.schemas[name] = schema as never
  }

  sayWhichKeys(document)
  return document
}

/** Better Auth's operation, with Merran's examples on its JSON request and answer. */
function withExamples(
  operation: Operation,
  examples: { requestExample?: unknown; responseExample: unknown }
): Operation {
  type Media = Record<string, Record<string, unknown>>
  const body = operation.requestBody as { content?: Media } | undefined
  const responses = operation.responses as Record<string, { content?: Media }>
  const ok = responses["200"]
  return {
    ...operation,
    ...(body?.content?.["application/json"] && "requestExample" in examples
      ? {
          requestBody: {
            ...body,
            content: {
              ...body.content,
              "application/json": {
                ...body.content["application/json"],
                example: examples.requestExample,
              },
            },
          },
        }
      : {}),
    responses: {
      ...responses,
      ...(ok?.content?.["application/json"]
        ? {
            200: {
              ...ok,
              content: {
                ...ok.content,
                "application/json": {
                  ...ok.content["application/json"],
                  example: examples.responseExample,
                },
              },
            },
          }
        : {}),
    },
  }
}

/**
 * Writes each route's API key permission into its description too, from
 * `x-merran-permission`, for readers of reference pages that don't show
 * extensions. It's never written by hand.
 */
function sayWhichKeys(document: Document) {
  for (const methods of Object.values(document.paths ?? {})) {
    for (const operation of Object.values(methods ?? {})) {
      const permission = (operation as Operation | undefined)?.[KEY_PERMISSION]
      if (typeof permission !== "string") continue
      const sentence =
        permission === "any"
          ? "Any API key that works will do: it needs no permission."
          : `With an API key, it needs the \`${permission.replace(":", ": ")}\` permission.`
      const op = operation as { description?: string }
      op.description = op.description
        ? `${op.description} ${sentence}`
        : sentence
    }
  }
}
