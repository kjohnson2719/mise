import { z } from "@hono/zod-openapi"
import {
  INGREDIENT_MARKS,
  PROPOSAL_SECTIONS,
  PROPOSAL_STATUSES,
  TIDY_SECTIONS,
} from "@merran/shared"
import { JOB_STATUSES, PROPOSAL_KINDS } from "../../database/entities/index.ts"
import { IDS, RECIPE, TIMES } from "./examples.ts"
import { RecipeSchema } from "./recipes.ts"

export const TidySectionSchema = z.enum(TIDY_SECTIONS).openapi("TidySection", {
  description:
    "A part of a recipe tidy up can change: its ingredients, steps, tags, a missing description, missing servings and times, and the marks on its ingredients.",
})

export const ProposalSectionSchema = z
  .enum(PROPOSAL_SECTIONS)
  .openapi("ProposalSection", {
    description:
      "A part of a recipe a suggestion can change: tidy up's sections, and the notes, which a cooking note can add to.",
  })

const MarkedLineSchema = z
  .object({
    line: z.string(),
    mark: z.enum(INGREDIENT_MARKS).nullable(),
  })
  .openapi("MarkedLine")

const FoodLineSchema = z
  .object({
    line: z.string(),
    food: z.string().nullable().openapi({
      description:
        "The food Merran knows that the line is, as a food key; null when no one has said.",
    }),
  })
  .openapi("FoodLine")

const TidyValuesSchema = z
  .object({
    ingredients: z.array(z.string()).optional(),
    steps: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    description: z.string().nullable().optional(),
    details: z
      .object({
        servings: z.number().nullable(),
        prepMinutes: z.number().nullable(),
        cookMinutes: z.number().nullable(),
        totalMinutes: z.number().nullable(),
      })
      .optional(),
    marks: z.array(MarkedLineSchema).optional(),
    foods: z.array(FoodLineSchema).optional(),
    notes: z.string().nullable().optional(),
  })
  .openapi("TidyValues", {
    description:
      "A recipe's sections, only the ones a suggestion changes. Ingredients and steps are editor lines.",
  })

const PROPOSAL = {
  id: IDS.proposal,
  kind: "tidy" as const,
  status: "pending" as "pending" | "applied",
  resolvedAt: null as string | null,
  recipe: {
    id: IDS.lemonChicken,
    slug: "lemon-chicken",
    name: "Lemon Chicken",
  },
  summary: "Split a long step and marked the chicken as needed.",
  sections: ["steps", "marks"] as ("steps" | "marks")[],
  note: null,
  payload: null,
  chat: null,
  before: {
    steps: [
      "Rub the chicken with lemon and garlic, then roast it at 200°C for 40 minutes until golden. Enjoy!",
    ],
    marks: [
      { line: "2 lb chicken thighs", mark: null },
      { line: "2 lemons, juiced", mark: null },
    ],
  },
  after: {
    steps: [
      "Rub the chicken with lemon and garlic.",
      "Roast at 200°C for 40 minutes, until golden.",
    ],
    marks: [
      { line: "2 lb chicken thighs", mark: "needed" as const },
      { line: "2 lemons, juiced", mark: "needed" as const },
    ],
  },
  createdAt: TIMES.created,
}

export const ProposalSchema = z
  .object({
    id: z.string(),
    kind: z.enum(PROPOSAL_KINDS),
    status: z.enum(PROPOSAL_STATUSES),
    recipe: z
      .object({ id: z.string(), slug: z.string(), name: z.string() })
      .nullable(),
    summary: z
      .string()
      .openapi({ description: "What it changes, in a sentence." }),
    sections: z.array(ProposalSectionSchema).openapi({
      description:
        "The sections it changes, each applied or skipped on its own.",
    }),
    note: z.string().nullable().openapi({
      description: "The cooking note it came from, for one made from a note.",
    }),
    payload: z.record(z.string(), z.unknown()).nullable().openapi({
      description:
        "What an assistant's suggestion adds, by kind: `recipe` (a recipe, as the editor writes one), `meals` (meals for the plan), `items` (lines for the list), tastes to remember (`avoid`, `diets`, `weeknightMinutes`), a recipe page to import (`url`, `name`, `site`, `photo`, `minutes`, `why`), or a stand-in for an ingredient (`ingredientId`, `insteadOf`, `lines`, `note`, `steps`), which applying saves to the recipe. Null for changes to a recipe's sections.",
    }),
    chat: z.string().nullable().openapi({
      description:
        "The assistant's chat it came from, for one from the assistant.",
    }),
    before: TidyValuesSchema,
    after: TidyValuesSchema,
    createdAt: z.iso.datetime(),
    resolvedAt: z.iso.datetime().nullable(),
  })
  .openapi("Proposal", { example: PROPOSAL })

export const ProposalListSchema = z
  .object({
    proposals: z.array(ProposalSchema),
    total: z.number().openapi({ description: "How many are waiting in all." }),
  })
  .openapi("ProposalList", { example: { proposals: [PROPOSAL], total: 1 } })

export const ProposalListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  recipe: z.string().optional().openapi({
    description: "Only this recipe's, by its id or address.",
  }),
})

export const ProposalParam = z.object({
  proposalId: z.string().openapi({
    param: { name: "proposalId", in: "path" },
    example: IDS.proposal,
  }),
})

/** A recipe's waiting suggestion, or none. */
export const RecipeProposalSchema = z
  .object({ proposal: z.union([ProposalSchema, z.null()]) })
  .openapi("RecipeProposal", { example: { proposal: PROPOSAL } })

export const TidyInputSchema = z
  .object({
    sections: z
      .array(TidySectionSchema)
      .max(TIDY_SECTIONS.length)
      .optional()
      .openapi({
        description: "What to tidy; every section when left out.",
      }),
  })
  .openapi("TidyInput", { example: { sections: ["steps", "tags", "marks"] } })

export const ApplyInputSchema = z
  .object({
    sections: z.array(ProposalSectionSchema).optional().openapi({
      description:
        "For changes to a recipe: the sections to apply. The rest are skipped.",
    }),
  })
  .openapi("ApplyInput", { example: { sections: ["steps", "marks"] } })

export const ApplyResultSchema = z
  .object({
    proposal: ProposalSchema,
    recipe: z.union([RecipeSchema, z.null()]).openapi({
      description: "The recipe it changed or made, if it did.",
    }),
  })
  .openapi("ApplyResult", {
    example: {
      proposal: { ...PROPOSAL, status: "applied", resolvedAt: TIMES.now },
      recipe: RECIPE,
    },
  })

const RUN = {
  id: IDS.tidyRun,
  status: "running" as const,
  library: true,
  total: 52,
  done: 12,
  suggested: 9,
  fine: 3,
  failed: 0,
  stopped: null,
  startedAt: TIMES.created,
  finishedAt: null,
}

export const TidyRunSchema = z
  .object({
    id: z.string(),
    status: z.enum(JOB_STATUSES),
    library: z.boolean().openapi({
      description: "Every recipe not tidied yet, rather than ones picked.",
    }),
    total: z.number(),
    done: z.number(),
    suggested: z.number().openapi({
      description: "Recipes with suggestions waiting in Review.",
    }),
    fine: z
      .number()
      .openapi({ description: "Recipes with nothing to change." }),
    failed: z.number(),
    stopped: z.string().nullable().openapi({
      description:
        "Why it stopped before the end, when it did: no AI, this month's limit, no credit, or three failures in a row.",
    }),
    startedAt: z.iso.datetime().nullable(),
    finishedAt: z.iso.datetime().nullable(),
  })
  .openapi("TidyRun", { example: RUN })

export const TidyRunsSchema = z
  .object({
    runs: z.array(TidyRunSchema),
    untidied: z.number().openapi({
      description: "How many of its recipes tidy up hasn't looked at yet.",
    }),
  })
  .openapi("TidyRuns", { example: { runs: [RUN], untidied: 40 } })

export const TidyRunInputSchema = z
  .object({
    ids: z.array(z.string()).min(1).max(200).optional().openapi({
      description:
        "The recipes to tidy. Left out, every recipe not tidied yet, which only household admins can start.",
    }),
  })
  .openapi("TidyRunInput", {
    example: { ids: [IDS.lemonChicken, IDS.garlicRice] },
  })

export const TidyRunParam = z.object({
  runId: z
    .string()
    .openapi({ param: { name: "runId", in: "path" }, example: IDS.tidyRun }),
})
