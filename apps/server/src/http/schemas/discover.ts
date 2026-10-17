import { z } from "@hono/zod-openapi"
import { DISCOVERY_STATUSES } from "../../database/entities/index.ts"
import { IDS, TIMES } from "./examples.ts"

const FOUND = {
  url: "https://cooking.example/butternut-squash-soup",
  name: "Roasted Butternut Squash Soup",
  site: "cooking.example",
  minutes: 60,
  photo: "https://cooking.example/images/squash-soup.jpg",
  why: "Vegetarian and freezes well, with the squash roasted for depth.",
}

const SEARCH = {
  id: IDS.discovery,
  theme: "cozy fall soups",
  collection: null,
  status: "done" as const,
  error: null,
  recipes: [FOUND],
  createdAt: TIMES.created,
  updatedAt: TIMES.created,
}

export const DiscoverySchema = z
  .object({
    id: z.string(),
    theme: z.string(),
    collection: z.string().nullable().openapi({
      description:
        "The starter collection it found more for (`POST /collections/{collection}/find`), or null.",
    }),
    status: z.enum(DISCOVERY_STATUSES).openapi({
      description: "Still searching, done, or failed (`error` says why).",
    }),
    error: z.string().nullable(),
    recipes: z
      .array(
        z.object({
          url: z.string().openapi({
            description:
              "The recipe's page, to import at `POST /recipes/import`.",
          }),
          name: z.string(),
          site: z.string(),
          minutes: z.number().nullable(),
          photo: z.string().nullable(),
          why: z.string().openapi({ description: "Why it's a good pick." }),
        })
      )
      .openapi({
        description:
          "Up to eight, each a page Merran opened and can import, no more than two from a site unless there aren't others.",
      }),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .openapi("Discovery", { example: SEARCH })

export const DiscoveryListSchema = z
  .object({ searches: z.array(DiscoverySchema) })
  .openapi("DiscoveryList", { example: { searches: [SEARCH] } })

export const DiscoverInputSchema = z
  .object({
    theme: z
      .string()
      .trim()
      .min(2, "Say what you're in the mood for.")
      .max(200, "Keep it under 200 characters."),
  })
  .openapi("DiscoverInput", { example: { theme: "cozy fall soups" } })

export const DiscoveryParam = z.object({
  discoveryId: z.string().openapi({
    param: { name: "discoveryId", in: "path" },
    example: IDS.discovery,
  }),
})
