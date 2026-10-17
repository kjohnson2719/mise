import { AppError } from "../../../core/errors.ts"
import type { Fetcher } from "../../fetch/public-fetch.ts"
import { MAX_PHOTO_BYTES } from "../../recipes/photos.ts"
import type { AppCookNote, AppSource } from "../types.ts"
import {
  cookNoteOf,
  fromMealie,
  mealieId,
  mealieRef,
  type MealieRecipe,
} from "./recipe.ts"

// Mealie over its API, for the server admin: Mealie usually lives on the
// home network, so this only ever reaches the address they typed in.

/* eslint-disable @typescript-eslint/no-explicit-any -- Mealie's JSON varies by version */

const PAGE_SIZE = 50

const badToken = () =>
  new AppError(
    "invalid",
    "mealie_token",
    "Mealie didn't take that API token.",
    {
      token: "Make one in Mealie under your profile, in API Tokens.",
    }
  )

const notMealie = () =>
  new AppError("upstream", "not_mealie", "That doesn't look like Mealie.", {
    url: "Use the address you open Mealie at, like http://192.168.1.20:9000",
  })

/** Talks to one Mealie with one token. */
export function mealieClient(fetcher: Fetcher, address: string, token: string) {
  const root = address.trim().replace(/\/+$/, "")

  async function call(
    path: string,
    {
      accept = "application/json",
      maxBytes,
    }: { accept?: string; maxBytes?: number } = {}
  ) {
    try {
      const answer = await fetcher(`${root}${path}`, {
        accept,
        maxBytes,
        headers: { authorization: `Bearer ${token}` },
        homeNetwork: true,
        keepErrors: true,
      })
      if (answer.status === 401 || answer.status === 403) throw badToken()
      return answer
    } catch (err) {
      if (!(err instanceof AppError)) throw err
      if (err.code === "site_timeout") {
        throw new AppError(
          "upstream",
          "mealie_timeout",
          "Mealie took too long to answer."
        )
      }
      if (err.code === "site_unreachable") {
        throw new AppError(
          "upstream",
          "mealie_unreachable",
          `Couldn't reach Mealie at ${root}.`,
          {
            url: "Use an address this server can reach, like http://192.168.1.20:9000",
          }
        )
      }
      throw err
    }
  }

  async function json(path: string): Promise<any> {
    const answer = await call(path, { maxBytes: 20_000_000 })
    if (answer.status === 404) throw notMealie()
    if (answer.status >= 400) {
      throw new AppError(
        "upstream",
        "mealie_error",
        `Mealie answered with an error (${answer.status}).`
      )
    }
    try {
      return JSON.parse(answer.body.toString("utf8"))
    } catch {
      throw notMealie()
    }
  }

  /** Something that's fine to do without, like a recipe's history. */
  const maybe = async (path: string, fallback: unknown): Promise<any> => {
    try {
      return await json(path)
    } catch {
      return fallback
    }
  }

  return {
    about: () => json("/api/app/about"),
    page: (page: number, perPage = PAGE_SIZE) =>
      json(
        `/api/recipes?page=${page}&perPage=${perPage}&orderBy=created_at&orderDirection=asc`
      ),
    recipe: (slug: string) => json(`/api/recipes/${encodeURIComponent(slug)}`),
    async photo(id: string) {
      const answer = await call(
        `/api/media/recipes/${mealieId(id)}/images/original.webp`,
        { accept: "image/webp,image/*", maxBytes: MAX_PHOTO_BYTES }
      )
      return answer.status === 200 ? answer.body : null
    },
    /** "Made it" entries with what people said, newest Mealie only. */
    async timeline(slug: string): Promise<any[]> {
      const filter = encodeURIComponent(`recipe.slug="${slug}"`)
      const page = await maybe(
        `/api/recipes/timeline/events?queryFilter=${filter}&perPage=-1`,
        null
      )
      return Array.isArray(page?.items) ? page.items : []
    },
    /**
     * When it was last made, for a Mealie that no longer says on the recipe.
     */
    async lastMade(slug: string) {
      const made = await maybe(
        `/api/households/self/recipes/${encodeURIComponent(slug)}`,
        null
      )
      return made?.lastMade ?? null
    },
    /**
     * Everyone's email, by their Mealie id: all of them for an admin's
     * token, otherwise only the token's own person.
     */
    async people() {
      const emails = new Map<string, string>()
      const users = await maybe("/api/admin/users?perPage=-1", null)
      const list = Array.isArray(users?.items)
        ? users.items
        : [await maybe("/api/users/self", null)]
      for (const user of list) {
        if (user?.id && typeof user.email === "string") {
          emails.set(mealieId(user.id), user.email)
        }
      }
      return emails
    },
  }
}

/** Connects, and says which Mealie it is and how many recipes it has. */
export async function checkMealie(
  fetcher: Fetcher,
  url: string,
  token: string
) {
  const mealie = mealieClient(fetcher, url, token)
  const about = await mealie.about()
  if (!about || typeof about !== "object" || !("version" in about)) {
    throw notMealie()
  }
  // The version needs no token; this does, so a wrong one shows now.
  const first = await mealie.page(1, 1)
  return {
    version: typeof about.version === "string" ? about.version : null,
    recipes: Number(first?.total ?? 0),
  }
}

/** Every recipe in a Mealie, a page at a time. */
export async function openMealieServer(
  fetcher: Fetcher,
  url: string,
  token: string
): Promise<AppSource> {
  const mealie = mealieClient(fetcher, url, token)
  const first = await mealie.page(1)
  const total = Number(first?.total ?? 0)
  const pages = Number(first?.total_pages ?? first?.totalPages ?? 1)
  const emails = await mealie.people()
  const emailOf = (id: unknown): string | null =>
    (id ? emails.get(mealieId(id)) : null) || null

  async function read(summary: any) {
    const recipe: MealieRecipe = await mealie.recipe(String(summary.slug))
    if (!("lastMade" in recipe)) {
      recipe.lastMade = await mealie.lastMade(String(summary.slug))
    }
    const notes = [
      ...(await mealie.timeline(String(summary.slug)))
        .filter((event) => event?.eventType === "comment")
        .map((event) =>
          cookNoteOf(event.eventMessage, event.timestamp, emailOf(event.userId))
        ),
      ...(Array.isArray(recipe.comments) ? recipe.comments : []).map(
        (comment: any) =>
          cookNoteOf(comment.text, comment.createdAt, emailOf(comment.userId))
      ),
    ]
      .filter((note): note is AppCookNote => note !== null)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    return {
      ...fromMealie(recipe),
      createdBy: emailOf(recipe.userId),
      cookNotes: notes,
      photo: () => mealie.photo(String(recipe.id ?? summary.id)),
    }
  }

  return {
    app: "mealie",
    total,
    async *recipes() {
      for (let page = 1; page <= pages; page++) {
        const items = page === 1 ? first.items : (await mealie.page(page)).items
        if (!Array.isArray(items) || items.length === 0) break
        for (const summary of items) {
          yield {
            ref: mealieRef(summary.id),
            name: String(summary.name ?? summary.slug ?? ""),
            read: () => read(summary),
          }
        }
      }
    },
    close() {},
  }
}
