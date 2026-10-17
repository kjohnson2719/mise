import type {
  FoodLine,
  MarkedLine,
  ProposalSection,
  TidyValues,
} from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import { AppError } from "../../../core/errors.ts"
import { Proposal, User } from "../../../database/entities/index.ts"
import { RecipeInputSchema } from "../../../http/schemas/recipes.ts"
import type { AiDeps } from "../../ai/run.ts"
import {
  ImportPayload,
  ListPayload,
  MealsPayload,
  SwapPayload,
  TastesPayload,
} from "../../assistant/payloads.ts"
import { addTyped } from "../../list/list.ts"
import { addEntries } from "../../plan/plan.ts"
import { getTastes, saveTastes } from "../../plan/preferences.ts"
import type { FileStore } from "../../storage/files.ts"
import type { VideoDeps } from "../import/import-video.ts"
import { importLink } from "../import/import-link.ts"
import { createRecipe, findRecipe, updateRecipe } from "../recipes.ts"
import { saveSwap } from "../swaps.ts"
import { describeProposal, detailsOf, tidyView } from "./tidy.ts"

// The Review queue: suggestions waiting to be applied, a section at a
// time, or dismissed. Applying goes through the recipe's own update, so it
// keeps a version and can be undone.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** What each section is called, in an error. */
const NAMES: Record<ProposalSection, string> = {
  ingredients: "ingredients",
  steps: "steps",
  tags: "tags",
  description: "description",
  details: "servings and times",
  marks: "marks",
  foods: "foods",
  notes: "notes",
}

/** "The steps", "The steps and tags", "The steps, tags and description". */
function listed(sections: ProposalSection[]) {
  const names = sections.map((section) => NAMES[section])
  const last = names.pop()!
  return `The ${names.length > 0 ? `${names.join(", ")} and ${last}` : last}`
}

/**
 * The suggestions waiting, newest first, a page at a time: all of them, or
 * one recipe's.
 */
export async function listProposals(
  em: EntityManager,
  {
    limit = 50,
    offset = 0,
    recipe,
  }: { limit?: number; offset?: number; recipe?: string } = {}
) {
  const recipeId = recipe ? (await findRecipe(em, recipe)).id : null
  const [proposals, total] = await em.findAndCount(
    Proposal,
    {
      status: "pending",
      // The assistant's are shown in its chats, not here.
      chat: null,
      recipe: recipeId ? recipeId : { deletedAt: null },
    },
    {
      populate: ["recipe"],
      orderBy: { createdAt: "desc", id: "desc" },
      limit,
      offset,
    }
  )
  return { proposals: proposals.map(describeProposal), total }
}

/** A recipe's waiting tidy up, or null. */
export async function recipeProposal(em: EntityManager, idOrSlug: string) {
  const recipe = await findRecipe(em, idOrSlug)
  const proposal = await em.findOne(
    Proposal,
    { recipe: recipe.id, kind: "tidy", status: "pending" },
    { populate: ["recipe"], orderBy: { createdAt: "desc" } }
  )
  return proposal ? describeProposal(proposal) : null
}

/** One suggestion, whatever's become of it. */
export async function getProposal(em: EntityManager, proposalId: string) {
  const proposal = UUID.test(proposalId)
    ? await em.findOne(Proposal, { id: proposalId }, { populate: ["recipe"] })
    : null
  if (!proposal) {
    throw new AppError(
      "not_found",
      "proposal_not_found",
      "There's no such suggestion."
    )
  }
  return describeProposal(proposal)
}

/**
 * Keeps a suggestion: from tidy up, a cooking note, or the assistant (with
 * its chat). It waits to be applied or dismissed.
 */
export async function createProposal(
  em: EntityManager,
  options: {
    householdId: string
    userId: string | null
    kind: Proposal["kind"]
    summary: string
    recipeId?: string | null
    before?: TidyValues
    after?: TidyValues
    payload?: Record<string, unknown> | null
    chat?: string | null
    note?: string | null
    job?: string | null
  }
) {
  const proposal = em.create(Proposal, {
    household: options.householdId,
    kind: options.kind,
    recipe: options.recipeId ?? null,
    status: "pending",
    summary: options.summary.trim().slice(0, 300) || "A suggestion.",
    before: options.before ?? {},
    after: options.after ?? {},
    payload: options.payload ?? null,
    chat: options.chat ?? null,
    note: options.note ?? null,
    job: options.job ?? null,
    createdBy: options.userId,
  })
  await em.flush()
  await em.populate(proposal, ["recipe"])
  return describeProposal(proposal)
}

async function findPending(em: EntityManager, proposalId: string) {
  const proposal = UUID.test(proposalId)
    ? await em.findOne(Proposal, { id: proposalId }, { populate: ["recipe"] })
    : null
  if (!proposal) {
    throw new AppError(
      "not_found",
      "proposal_not_found",
      "There's no such suggestion."
    )
  }
  if (proposal.status !== "pending") {
    throw new AppError(
      "conflict",
      "proposal_resolved",
      `That suggestion was ${proposal.status} already.`
    )
  }
  return proposal
}

/** Values in a fixed order: Postgres keeps JSON objects' keys in its own. */
const sorted = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(sorted)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => [key, sorted(item)])
        )
      : value

const same = (a: unknown, b: unknown) =>
  JSON.stringify(sorted(a)) === JSON.stringify(sorted(b))

/** Notes who applied or dismissed a suggestion, and when. */
function resolve(
  em: EntityManager,
  proposal: Proposal,
  status: "applied" | "dismissed",
  userId: string | null
) {
  proposal.status = status
  proposal.resolvedAt = new Date()
  proposal.resolvedBy = userId
    ? em.getReference(User, userId, { wrapped: true })
    : null
}

/**
 * Applies a suggestion. Changes to a recipe apply the sections chosen, as
 * one change that keeps a version; a section changed since it was
 * suggested is refused rather than overwritten, and says which. The
 * assistant's other suggestions add what they say: a recipe, meals, things
 * for the list, tastes to remember, or a recipe from the web.
 */
export async function applyProposal(
  em: EntityManager,
  deps: AiDeps & VideoDeps & { files: FileStore },
  options: {
    householdId: string
    userId: string | null
    proposalId: string
    sections?: readonly ProposalSection[]
  }
) {
  const proposal = await findPending(em, options.proposalId)
  const recipe = await applyKind(em, deps, proposal, options)
  resolve(em, proposal, "applied", options.userId)
  await em.flush()
  return { proposal: describeProposal(proposal), recipe }
}

/** What applying each kind of suggestion does; the recipe it made or changed. */
async function applyKind(
  em: EntityManager,
  deps: AiDeps & VideoDeps & { files: FileStore },
  proposal: Proposal,
  options: {
    householdId: string
    userId: string | null
    sections?: readonly ProposalSection[]
  }
) {
  const { householdId, userId } = options
  const payload = proposal.payload ?? {}
  switch (proposal.kind) {
    case "tidy":
    case "note":
    case "edit":
      return applySections(em, proposal, {
        householdId,
        userId,
        sections: options.sections ?? [],
      })
    case "recipe":
      return createRecipe(em, {
        householdId,
        userId,
        input: RecipeInputSchema.parse(payload.recipe),
        origin: "assistant",
      })
    case "meals": {
      const { meals } = MealsPayload.parse(payload)
      await addEntries(
        em,
        householdId,
        meals.map((meal) => ({
          date: meal.date,
          meal: meal.meal,
          recipe: meal.recipe?.id ?? null,
          withRecipe: meal.with?.id ?? null,
          note: meal.note,
          servings: meal.servings,
        }))
      )
      return null
    }
    case "list": {
      const { items } = ListPayload.parse(payload)
      for (const text of items) await addTyped(em, householdId, { text })
      return null
    }
    case "tastes": {
      const add = TastesPayload.parse(payload)
      const now = await getTastes(em, householdId)
      await saveTastes(em, householdId, {
        avoid: [...now.avoid, ...add.avoid],
        diets: [...new Set([...now.diets, ...add.diets])],
        weeknightMinutes: add.weeknightMinutes ?? now.weeknightMinutes,
      })
      return null
    }
    case "swap": {
      // Saved to the recipe; using it this time is the web app's own.
      const swap = SwapPayload.parse(payload)
      const { recipe } = await saveSwap(em, {
        householdId,
        userId,
        recipe: proposal.recipe!.id,
        ingredientId: swap.ingredientId,
        lines: swap.lines,
        steps: swap.steps,
      })
      return recipe
    }
    case "import": {
      const { url } = ImportPayload.parse(payload)
      const { recipe } = await importLink(em, deps, {
        householdId,
        userId,
        url,
      })
      return recipe
    }
  }
}

/** Applies the sections of a change to a recipe that are chosen. */
async function applySections(
  em: EntityManager,
  proposal: Proposal,
  options: {
    householdId: string
    userId: string | null
    sections: readonly ProposalSection[]
  }
) {
  const chosen = options.sections.filter((section) => section in proposal.after)
  if (chosen.length === 0) {
    throw new AppError(
      "invalid",
      "nothing_chosen",
      "Pick something to apply.",
      { sections: "Pick something to apply." }
    )
  }
  const recipe = await findRecipe(em, proposal.recipe!.id)
  const now = await tidyView(em, recipe)
  const { before, after } = proposal

  const current: Record<ProposalSection, unknown> = {
    ingredients: now.input.ingredients,
    steps: now.input.steps,
    tags: now.input.tags,
    description: now.input.description,
    details: detailsOf(now.input),
    marks: now.marks,
    foods: now.foods,
    notes: now.input.notes,
  }
  const changed = chosen.filter(
    (section) => !same(current[section], before[section])
  )
  if (changed.length > 0) {
    throw new AppError(
      "conflict",
      "proposal_outdated",
      `${listed(changed)} changed since this was suggested. Ask again for new suggestions.`
    )
  }

  const input = { ...now.input }
  if (chosen.includes("ingredients")) input.ingredients = after.ingredients!
  if (chosen.includes("steps")) input.steps = after.steps!
  if (chosen.includes("tags")) input.tags = after.tags!
  if (chosen.includes("description")) {
    input.description = after.description ?? null
  }
  if (chosen.includes("details")) Object.assign(input, after.details)
  if (chosen.includes("notes")) input.notes = after.notes ?? null
  // Marks go on whichever lines it ends up with, by line or by food.
  const marks: MarkedLine[] | undefined = chosen.includes("marks")
    ? after.marks
    : undefined
  // So do the foods it said lines are.
  const foods: FoodLine[] | undefined = chosen.includes("foods")
    ? after.foods
    : undefined

  return updateRecipe(em, {
    householdId: options.householdId,
    userId: options.userId,
    recipe: recipe.id,
    input,
    // A cooking note's or the assistant's change is an edit, as if they'd
    // made it themselves.
    source: proposal.kind === "tidy" ? "tidy" : "edit",
    marks,
    foods,
  })
}

/** Dismisses a suggestion, leaving the recipe as it is. */
export async function dismissProposal(
  em: EntityManager,
  options: { userId: string | null; proposalId: string }
) {
  const proposal = await findPending(em, options.proposalId)
  resolve(em, proposal, "dismissed", options.userId)
  await em.flush()
  return describeProposal(proposal)
}
