import {
  addDays,
  avoidedIn,
  AVOID_LEVELS,
  canRead,
  checkTastes,
  DIETS,
  dietsFor,
  foodKey,
  MEALS,
  missingDiets,
  parseIngredient,
  type HouseholdTastes,
  type TidyValues,
} from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import { tool, type ToolSet } from "ai"
import { z } from "zod"
import { AppError } from "../../core/errors.ts"
import type { Recipe } from "../../database/entities/index.ts"
import { RecipeInputSchema } from "../../http/schemas/recipes.ts"
import type { AiDeps } from "../ai/run.ts"
import { getList } from "../list/list.ts"
import { getPantry, householdToday } from "../pantry/pantry.ts"
import { listPlan } from "../plan/plan.ts"
import { getTastes } from "../plan/preferences.ts"
import { decodeDiets } from "../recipes/diet-labels.ts"
import { decodeHtml } from "../recipes/import/import-link.ts"
import {
  findBySourceUrl,
  isVideoLink,
  normalizeLink,
} from "../recipes/import/links.ts"
import { readRecipeData } from "../recipes/import/recipe-data.ts"
import {
  findRecipe,
  listRecipes,
  snapshotOf,
  totalMinutes,
} from "../recipes/recipes.ts"
import { createProposal } from "../recipes/review/proposals.ts"
import {
  cleanLines,
  detailsOf,
  sameList,
  tidyView,
} from "../recipes/review/tidy.ts"
import { listTags, tagKey, tagsOf } from "../recipes/tags.ts"
import { readReceipt } from "../receipts/receipts.ts"
import type { FileStore } from "../storage/files.ts"
import { readChatFile } from "./files.ts"

// What the assistant can do: look things up in the household's library,
// plan, list and pantry, and propose changes, which become cards in the
// chat for the person to apply. Nothing here changes anything itself.

type Context = {
  householdId: string
  userId: string
  chatId: string
  /** The photos and PDFs sent with the message being answered. */
  files: readonly { id: string }[]
}

/** A recipe by its id, address or name: the closest one, by name. */
async function lookupRecipe(em: EntityManager, ref: string) {
  try {
    return await findRecipe(em, ref)
  } catch (err) {
    if (!(err instanceof AppError) || err.code !== "recipe_not_found") throw err
  }
  const { recipes } = await listRecipes(em, {
    q: ref,
    tag: [],
    diet: [],
    sort: "name",
    limit: 1,
    offset: 0,
  })
  if (recipes[0]) return findRecipe(em, recipes[0].id)
  throw new AppError(
    "not_found",
    "recipe_not_found",
    `There's no recipe like "${ref}" in the library. Search for it first.`
  )
}

/**
 * Why a recipe can't go on the plan, for the model: it has one of the
 * household's allergies, or may, as Merran can't read its ingredients.
 * Allergies are never left to chance. Foods someone just doesn't eat are
 * theirs to ask for anyway, so the model, which knows them, keeps to them.
 */
function allergyIn(recipe: Recipe, tastes: HouseholdTastes) {
  const lines = recipe.ingredients.getItems().map((line) => line.rawText)
  const found = avoidedIn(
    lines,
    tastes.avoid.filter((item) => item.level === "allergy"),
    decodeDiets(recipe.diets)
  )
  if (found.length === 0) return null
  const foods = found.map((item) => item.food).join(", ")
  return canRead(lines)
    ? `${recipe.name} has ${foods}, an allergy in the household. Offer something else.`
    : `Merran can't read the ingredients of ${recipe.name}, so it can't check them for the household's allergies (${foods}). Offer something else.`
}

const Day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("A day, as 2026-10-15.")

/** Lines as a recipe's editor holds them: one a line, "# Section" headings. */
const Lines = z.array(z.string())

const RecipeFields = {
  description: z.string().nullable(),
  servings: z.number().nullable(),
  prepMinutes: z.number().nullable(),
  cookMinutes: z.number().nullable(),
  totalMinutes: z.number().nullable(),
  tags: z.array(z.string()).nullable(),
  ingredients: Lines.nullable().describe(
    'The whole list, one a line, like "1 ½ cups flour, sifted"; "# Sauce" starts a group.'
  ),
  steps: Lines.nullable().describe(
    'The whole list, one step a line, without numbers; "# Sauce" starts a group.'
  ),
  notes: z.string().nullable(),
}

export function assistantTools(
  deps: AiDeps & { files: FileStore },
  root: EntityManager,
  context: Context
): ToolSet {
  // A step can call several tools at once: each gets its own view.
  const fork = () => root.fork()
  const propose = (
    options: Omit<
      Parameters<typeof createProposal>[1],
      keyof Context | "userId" | "chat"
    >
  ) =>
    createProposal(fork(), {
      ...options,
      householdId: context.householdId,
      userId: context.userId,
      chat: context.chatId,
    }).then((proposal) => ({ proposal }))

  return {
    search_recipes: tool({
      description:
        "Search the household's recipe library. Each result says when it was last made. Use get_recipe for its lines, and whether it suits the household.",
      inputSchema: z.object({
        query: z
          .string()
          .nullable()
          .describe("Words in its name, description or tags; null for any."),
        tag: z.string().nullable(),
        maxMinutes: z
          .number()
          .nullable()
          .describe("Ready in this long or less."),
        notMadeYet: z.boolean().nullable(),
        limit: z.number().nullable().describe("Up to 20; 10 when null."),
      }),
      execute: async ({ query, tag, maxMinutes, notMadeYet, limit }) => {
        const em = fork()
        const { recipes, total } = await listRecipes(em, {
          q: query ?? undefined,
          tag: tag ? [tag] : [],
          diet: [],
          new: notMadeYet ?? undefined,
          maxMinutes: maxMinutes ?? undefined,
          sort: "rating",
          limit: Math.min(Math.max(Math.round(limit ?? 10), 1), 20),
          offset: 0,
        })
        return {
          total,
          recipes: recipes.map((recipe) => ({
            id: recipe.id,
            name: recipe.name,
            minutes: recipe.totalMinutes,
            servings: recipe.servings,
            rating: recipe.rating,
            tags: recipe.tags,
            lastMade: recipe.lastMadeAt?.slice(0, 10) ?? null,
          })),
        }
      },
    }),

    get_recipe: tool({
      description:
        "One recipe from the library, by its id or name: its lines, steps and notes, and what the household's tastes make of it.",
      inputSchema: z.object({ recipe: z.string() }),
      execute: async ({ recipe: ref }) => {
        const em = fork()
        const recipe = await lookupRecipe(em, ref)
        const tags = (await tagsOf(em, [recipe.id])).get(recipe.id) ?? []
        const input = snapshotOf(recipe, tags)
        const tastes = await getTastes(em, context.householdId)
        const lines = recipe.ingredients.getItems()
        const check = checkTastes(
          {
            name: recipe.name,
            lines: lines.map((line) => line.rawText),
            marks: lines.map((line) => line.mark ?? null),
            needs: recipe.needs,
          },
          tastes.avoid
        )
        return {
          id: recipe.id,
          name: recipe.name,
          description: input.description,
          servings: input.servings,
          yield: input.yieldText,
          prepMinutes: input.prepMinutes,
          cookMinutes: input.cookMinutes,
          totalMinutes: totalMinutes(recipe),
          tags,
          ingredients: input.ingredients,
          steps: input.steps,
          notes: input.notes,
          rating: recipe.rating ?? null,
          lastMade: recipe.lastMadeAt?.toISOString().slice(0, 10) ?? null,
          doesntSuit: check.ruledOut.map((item) => item.food),
          ...(check.unchecked.length > 0
            ? {
                cantRead:
                  "Merran can't read its ingredients to check them, so it may have anything in doesntSuit.",
              }
            : {}),
          leftOut: check.leaveOut.map((item) => ({
            food: item.food,
            for: item.who ?? "the household",
          })),
        }
      },
    }),

    list_tags: tool({
      description: "The household's tags, with how many recipes have each.",
      inputSchema: z.object({}),
      execute: async () => ({
        tags: (await listTags(fork())).map((tag) => ({
          name: tag.name,
          recipes: tag.recipes,
        })),
      }),
    }),

    get_meal_plan: tool({
      description:
        "The meal plan between two days: what's planned, cooked or skipped. Two weeks from today when the days are null.",
      inputSchema: z.object({ from: Day.nullable(), to: Day.nullable() }),
      execute: async ({ from, to }) => {
        const em = fork()
        const today = await householdToday(em, context.householdId)
        const start = from ?? today
        const entries = await listPlan(em, {
          from: start,
          to: to ?? addDays(start, 13),
        })
        return {
          meals: entries.map((entry) => ({
            date: entry.date,
            anyDayThatWeek: entry.anyDay,
            meal: entry.meal,
            status: entry.status,
            recipe: entry.recipe
              ? { id: entry.recipe.id, name: entry.recipe.name }
              : null,
            with: entry.withRecipe?.name ?? null,
            note: entry.note,
            servings: entry.servings,
          })),
        }
      },
    }),

    get_shopping_list: tool({
      description: "The shopping list: what's to buy, and what's ticked off.",
      inputSchema: z.object({}),
      execute: async () => {
        const em = fork()
        const { items } = await getList(em, context.householdId)
        return {
          items: items.map((item) => ({
            name: item.name,
            amount: item.amount || null,
            ticked: item.checked,
          })),
        }
      },
    }),

    get_pantry: tool({
      description:
        "What's at home, in the fridge, the freezer and the cupboard, and when it should be used by.",
      inputSchema: z.object({}),
      execute: async () => {
        const em = fork()
        const { items } = await getPantry(em, context.householdId)
        return {
          today: await householdToday(em, context.householdId),
          items: items.map((item) => ({
            name: item.name,
            amount: item.amount || null,
            storedIn: item.storedIn,
            useBy: item.useBy,
          })),
        }
      },
    }),

    propose_recipe_edit: tool({
      description:
        "Suggest changes to a recipe in the library: a swap, a scaled batch, an extra step, notes. Give the whole new list for a list you change, keeping its other lines word for word, and null for anything that stays as it is. It's a card they apply.",
      inputSchema: z.object({
        recipe: z.string().describe("Its id or name."),
        summary: z
          .string()
          .describe("What changes, in one short sentence, for the card."),
        ...RecipeFields,
      }),
      execute: async ({ recipe: ref, summary, ...proposed }) => {
        const em = fork()
        const recipe = await lookupRecipe(em, ref)
        const { input } = await tidyView(em, recipe)
        const before: TidyValues = {}
        const after: TidyValues = {}
        for (const section of ["ingredients", "steps"] as const) {
          const value = proposed[section]
          if (!value) continue
          const lines =
            section === "ingredients"
              ? cleanLines(value, 300, 500)
              : cleanLines(value, 200, 5000)
          if (lines.length > 0 && !sameList(lines, input[section])) {
            before[section] = input[section]
            after[section] = lines
          }
        }
        if (proposed.tags) {
          const tags = [
            ...new Set(proposed.tags.map((tag) => tag.trim()).filter(Boolean)),
          ].slice(0, 30)
          const keys = (list: readonly string[]) => list.map(tagKey).sort()
          if (!sameList(keys(tags), keys(input.tags))) {
            before.tags = input.tags
            after.tags = tags
          }
        }
        const description = proposed.description?.trim().slice(0, 2000)
        if (description && description !== input.description) {
          before.description = input.description
          after.description = description
        }
        const current = detailsOf(input)
        const details = { ...current }
        for (const key of [
          "servings",
          "prepMinutes",
          "cookMinutes",
          "totalMinutes",
        ] as const) {
          const value = proposed[key]
          if (value !== null && value > 0 && value < 100_000) {
            details[key] = key === "servings" ? value : Math.round(value)
          }
        }
        if (!sameList([details], [current])) {
          before.details = current
          after.details = details
        }
        const notes = proposed.notes?.trim().slice(0, 5000)
        if (notes && notes !== input.notes) {
          before.notes = input.notes
          after.notes = notes
        }
        if (Object.keys(after).length === 0) {
          throw new AppError(
            "invalid",
            "nothing_changes",
            "That doesn't change the recipe: give the new lines or values."
          )
        }
        return propose({
          kind: "edit",
          summary,
          recipeId: recipe.id,
          before,
          after,
        })
      },
    }),

    propose_new_recipe: tool({
      description:
        "Suggest a new recipe from the conversation, written out in full. It's a card they save to the library.",
      inputSchema: z.object({
        summary: z.string().describe("What it is, in a short sentence."),
        name: z.string(),
        ...RecipeFields,
      }),
      execute: async ({ summary, name, ...fields }) => {
        const em = fork()
        const parsed = RecipeInputSchema.safeParse({
          name,
          description: fields.description,
          servings: fields.servings,
          prepMinutes: fields.prepMinutes && Math.round(fields.prepMinutes),
          cookMinutes: fields.cookMinutes && Math.round(fields.cookMinutes),
          totalMinutes: fields.totalMinutes && Math.round(fields.totalMinutes),
          notes: fields.notes,
          tags: fields.tags ?? [],
          ingredients: cleanLines(fields.ingredients ?? [], 300, 500),
          steps: cleanLines(fields.steps ?? [], 200, 5000),
        })
        if (!parsed.success) {
          throw new AppError(
            "invalid",
            "invalid_recipe",
            `That recipe can't be saved: ${parsed.error.issues[0]?.message ?? "something's off"}`
          )
        }
        return propose({
          kind: "recipe",
          summary,
          payload: { recipe: parsed.data },
        })
      },
    }),

    propose_meals: tool({
      description:
        'Suggest meals for the plan: recipes from the library (by id or name), with a recipe that goes with it if wanted, or a note like "Leftovers". It\'s a card they add to the plan.',
      inputSchema: z.object({
        summary: z.string().describe("What it plans, in a short sentence."),
        meals: z
          .array(
            z.object({
              date: Day,
              meal: z.enum(MEALS),
              recipe: z.string().nullable(),
              with: z
                .string()
                .nullable()
                .describe("A recipe it goes with, like a sauce."),
              note: z.string().nullable(),
              servings: z.number().nullable(),
            })
          )
          .min(1)
          .max(21),
      }),
      execute: async ({ summary, meals }) => {
        const em = fork()
        const tastes = await getTastes(em, context.householdId)
        const ref = async (name: string | null) => {
          if (!name) return null
          const recipe = await lookupRecipe(em, name)
          const allergy = allergyIn(recipe, tastes)
          if (allergy) throw new AppError("invalid", "allergy", allergy)
          return { id: recipe.id, slug: recipe.slug, name: recipe.name }
        }
        const planned = []
        for (const meal of meals) {
          const recipe = await ref(meal.recipe)
          const note = meal.note?.trim().slice(0, 200) || null
          if (!recipe && !note) {
            throw new AppError(
              "invalid",
              "empty_meal",
              `The ${meal.meal} on ${meal.date} needs a recipe or a note.`
            )
          }
          planned.push({
            date: meal.date,
            meal: meal.meal,
            recipe,
            with: await ref(meal.with),
            note,
            servings:
              meal.servings && meal.servings > 0 && meal.servings <= 1000
                ? meal.servings
                : null,
          })
        }
        return propose({ kind: "meals", summary, payload: { meals: planned } })
      },
    }),

    scan_receipt: tool({
      description:
        "Read a receipt sent with this message (a photo, screenshots or a PDF) into a draft for the pantry: they look it over, fix anything, and add it, which takes what they bought off the shopping list too. Don't list its lines in the chat.",
      inputSchema: z.object({}),
      execute: async () => {
        if (context.files.length === 0) {
          throw new AppError(
            "invalid",
            "no_receipt",
            "No photo or PDF came with this message. Ask them to add the receipt with +."
          )
        }
        const owner = {
          householdId: context.householdId,
          userId: context.userId,
        }
        const input = await Promise.all(
          context.files.map(async (file) => {
            const kept = await readChatFile(deps.files, owner, file.id)
            if (!kept) {
              throw new AppError(
                "not_found",
                "file_not_found",
                "That file is gone. Ask them to add it again."
              )
            }
            return { body: kept.body, type: kept.mediaType }
          })
        )
        const { what, receipt } = await readReceipt(fork(), deps, {
          householdId: context.householdId,
          userId: context.userId,
          input: { files: input, text: null },
        })
        if (!receipt) {
          throw new AppError(
            "unprocessable",
            "not_a_receipt",
            what === "recipe"
              ? "That's a recipe, not a receipt: offer it with propose_new_recipe."
              : "There's no receipt in that."
          )
        }
        return {
          receipt: {
            id: receipt.id,
            store: receipt.store,
            date: receipt.date,
            lines: receipt.lines.length,
            food: receipt.lines.filter((line) => line.kind === "food").length,
            onList: receipt.lines.filter((line) => line.listItem).length,
          },
        }
      },
    }),

    propose_swap: tool({
      description:
        "Offer a stand-in for one of a recipe's ingredients, for someone out of it or who doesn't eat it: lines with amounts for the recipe as written, how it changes the dish, and any steps it changes. It's a card they use this time, or save to the recipe.",
      inputSchema: z.object({
        recipe: z.string().describe("Its id or name."),
        ingredient: z
          .string()
          .describe("The line it stands in for, as the recipe has it."),
        lines: z
          .array(z.string())
          .min(1)
          .max(5)
          .describe('The stand-in: "1 cup milk", "1 tbsp lemon juice".'),
        note: z
          .string()
          .describe(
            "How to use it and how it changes the dish, in a sentence."
          ),
        steps: z
          .array(z.object({ step: z.number(), text: z.string() }))
          .describe(
            'Steps it changes, by number (counting steps only, not "# " lines), rewritten in full. Usually none.'
          ),
      }),
      execute: async ({ recipe: ref, ingredient, lines, note, steps }) => {
        const em = fork()
        const recipe = await lookupRecipe(em, ref)
        const all = recipe.ingredients.getItems()
        const wanted = ingredient.trim().toLowerCase()
        const food = parseIngredient(ingredient).food
        const line =
          all.find((item) => item.rawText.trim().toLowerCase() === wanted) ??
          all.find(
            (item) => food && item.food && foodKey(item.food) === foodKey(food)
          ) ??
          all.find((item) => item.rawText.toLowerCase().includes(wanted))
        if (!line) {
          throw new AppError(
            "not_found",
            "ingredient_not_found",
            `${recipe.name} has no line like "${ingredient}". Its lines: ${all.map((item) => item.rawText).join("; ")}`
          )
        }
        const standIn = cleanLines(lines, 5, 500)
        const tastes = await getTastes(em, context.householdId)
        const avoided = avoidedIn(standIn, tastes.avoid)
        const offDiet = missingDiets(dietsFor(standIn), tastes.diets).length > 0
        // Lines it can't read may have anything, so they fail the checks.
        if ((avoided.length > 0 || offDiet) && !canRead(standIn)) {
          throw new AppError(
            "invalid",
            "unreadable",
            "Merran can't read those lines to check them against the household's tastes. Write them in English."
          )
        }
        if (avoided.length > 0) {
          throw new AppError(
            "invalid",
            "avoided",
            `The household doesn't eat ${avoided.map((item) => item.food).join(", ")}. Offer something else.`
          )
        }
        if (offDiet) {
          throw new AppError(
            "invalid",
            "against_diet",
            `That isn't ${tastes.diets.join(", ")}, which every meal must be. Offer something else.`
          )
        }
        const recipeSteps = recipe.steps.getItems()
        const changed = steps.flatMap((change) => {
          const step = recipeSteps[Math.round(change.step) - 1]
          const text = change.text.replace(/\s+/g, " ").trim().slice(0, 5000)
          return step && text && text !== step.text
            ? [{ stepId: step.id, text }]
            : []
        })
        return propose({
          kind: "swap",
          summary: `${standIn.join(", ")} instead of ${line.rawText}`,
          recipeId: recipe.id,
          payload: {
            ingredientId: line.id,
            insteadOf: line.rawText,
            lines: standIn,
            note: note.replace(/\s+/g, " ").trim().slice(0, 300),
            steps: changed,
          },
        })
      },
    }),

    propose_list_items: tool({
      description:
        'Suggest things for the shopping list, one a line with how much: "2 lb ground beef", "paper towels". It\'s a card they add to the list.',
      inputSchema: z.object({
        summary: z.string(),
        items: z.array(z.string()).min(1).max(40),
      }),
      execute: async ({ summary, items }) => {
        const em = fork()
        const lines = cleanLines(items, 40, 200)
        if (lines.length === 0) {
          throw new AppError("invalid", "no_items", "Give something to add.")
        }
        return propose({ kind: "list", summary, payload: { items: lines } })
      },
    }),

    propose_tastes: tool({
      description:
        "Offer to remember something about the household: a food someone doesn't eat (an allergy, never, or one to leave out of dishes that can do without it), and who it's for if not everyone; a diet every meal must fit; or the longest a weeknight dinner can take. It's a card they accept.",
      inputSchema: z.object({
        summary: z.string(),
        avoid: z.array(
          z.object({
            food: z.string(),
            level: z.enum(AVOID_LEVELS),
            who: z.string().nullable(),
          })
        ),
        diets: z.array(z.enum(DIETS)),
        weeknightMinutes: z.number().nullable(),
      }),
      execute: async ({ summary, avoid, diets, weeknightMinutes }) => {
        const em = fork()
        const foods = avoid
          .map((item) => ({
            food: item.food.trim().slice(0, 60),
            level: item.level,
            who: item.who?.trim().slice(0, 40) || null,
          }))
          .filter((item) => item.food)
        const minutes =
          weeknightMinutes && weeknightMinutes >= 10 && weeknightMinutes <= 240
            ? Math.round(weeknightMinutes)
            : null
        if (foods.length === 0 && diets.length === 0 && minutes === null) {
          throw new AppError(
            "invalid",
            "nothing_to_remember",
            "Give something to remember."
          )
        }
        return propose({
          kind: "tastes",
          summary,
          payload: { avoid: foods, diets, weeknightMinutes: minutes },
        })
      },
    }),

    propose_import_recipe: tool({
      description:
        "Offer a recipe page found on the web, to import into the library: the page's own link. Merran opens it first; one it can't read, or the library has, is refused, so offer another.",
      inputSchema: z.object({
        url: z.string(),
        why: z.string().describe("Why it's a good pick, in a line."),
      }),
      execute: async ({ url: raw, why }) => {
        const em = fork()
        const url = normalizeLink(raw)
        const known = await findBySourceUrl(em, [url])
        if (known) {
          return {
            alreadyInLibrary: { id: known.id, name: known.name },
          }
        }
        if (isVideoLink(url)) {
          throw new AppError(
            "unprocessable",
            "video_link",
            "Videos can't be imported yet. Offer a recipe page."
          )
        }
        const page = await deps.fetcher(url)
        const pageUrl = normalizeLink(page.url)
        const data = readRecipeData(
          decodeHtml(page.body, page.contentType),
          pageUrl
        )
        if (!data) {
          throw new AppError(
            "unprocessable",
            "no_recipe_data",
            "That page has no recipe on it Merran can read. Offer another."
          )
        }
        const site = new URL(pageUrl).hostname.replace(/^www\./, "")
        return propose({
          kind: "import",
          summary: `${data.input.name}, from ${site}`,
          payload: {
            url: pageUrl,
            name: data.input.name,
            site,
            photo: data.photoUrls[0] ?? null,
            minutes:
              data.input.totalMinutes ??
              ((data.input.prepMinutes ?? 0) + (data.input.cookMinutes ?? 0) ||
                null),
            why: why.trim().slice(0, 300),
          },
        })
      },
    }),
  }
}
