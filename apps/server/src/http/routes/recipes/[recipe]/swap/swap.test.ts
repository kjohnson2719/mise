import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../../../app.ts"
import type { JobRunner } from "../../../../../services/jobs/runner.ts"
import {
  fakeAiFetcher,
  GOOD_KEYS,
  mockAiModels,
  type MockCall,
} from "../../../../../test/ai.ts"
import {
  createTestApp,
  setUpServer,
  TestClient,
} from "../../../../../test/app.ts"

// Swaps, and cooking notes turned into suggested changes. The model answers
// with `swaps` or `edit`, whichever it's asked for, and what it was told is
// kept in `asked`.

type Prompt = { role: string; content: string | { text?: string }[] }[]

const PASTA = {
  name: "Tomato Pasta",
  servings: 4,
  prepMinutes: 5,
  cookMinutes: 15,
  ingredients: [
    "8 oz pasta",
    "2 tbsp tomato paste",
    "1 cup cream",
    "parsley, to serve",
  ],
  steps: [
    "Boil the pasta.",
    "Stir in the tomato paste and cook 3 minutes.",
    "Add the cream and toss with the pasta.",
  ],
}

const SWAPS = {
  swaps: [
    {
      lines: ["1 cup tomato sauce", " a pinch of  sugar "],
      note: "Simmer it down so it's thick; a little sweeter.",
      atHome: true,
      steps: [
        {
          step: 2,
          text: "Stir in the tomato sauce and sugar and simmer 12 minutes, until thick.",
        },
        // Not a step, and a step that doesn't change: both left out.
        { step: 9, text: "Eat." },
        { step: 1, text: "Boil the pasta." },
      ],
    },
    // Avoided by the household, against its diet, and empty: all dropped.
    {
      lines: ["8 oz mushrooms, blended"],
      note: "Earthy.",
      atHome: false,
      steps: [],
    },
    { lines: ["2 strips bacon"], note: "Smoky.", atHome: false, steps: [] },
    { lines: [" "], note: "Nothing.", atHome: false, steps: [] },
  ],
}

const EDIT = {
  change: true,
  summary: "Adds salt and 5 more minutes.",
  servings: null,
  prepMinutes: null,
  cookMinutes: 20,
  totalMinutes: null,
  ingredients: [...PASTA.ingredients, "1 tsp salt"],
  steps: null,
  notes: null,
}

const swaps: () => unknown = () => SWAPS
let edit: () => unknown = () => EDIT
let asked: Prompt = []
const reply = (call: MockCall) => {
  const prompt = call.prompt as Prompt
  const first = prompt.find((m) => m.role === "system")?.content
  // A recipe's nutrition, worked out in the background after it's saved.
  if (typeof first === "string" && first.startsWith("You estimate nutrition")) {
    return JSON.stringify({
      calories: 500,
      protein: null,
      carbs: null,
      fat: null,
      fiber: null,
      sugar: null,
      sodium: null,
    })
  }
  asked = prompt
  const system = asked.find((m) => m.role === "system")?.content
  if (typeof system !== "string") return "ok"
  if (system.startsWith("Someone's about to cook")) {
    return JSON.stringify(swaps())
  }
  if (system.startsWith("Someone left a note")) return JSON.stringify(edit())
  return "ok"
}
const prompt = () =>
  asked
    .filter((m) => m.role === "user")
    .flatMap((m) =>
      typeof m.content === "string" ? [m.content] : m.content.map((p) => p.text)
    )
    .join("\n")

let app: App
let jobs: JobRunner
let close: () => Promise<void>
let kyle: TestClient

beforeAll(async () => {
  const test = await createTestApp({
    fetcher: fakeAiFetcher(),
    ai: mockAiModels(undefined, [], undefined, reply),
  })
  ;({ app, jobs, close } = test)
  kyle = await setUpServer(app, test.setupCode)
  const res = await kyle.post("/api/recipes", PASTA)
  expect(res.status, await res.clone().text()).toBe(201)
})

afterAll(() => close())

const pasta = async () => (await kyle.get("/api/recipes/tomato-pasta")).json()
const paste = async () =>
  (await pasta()).ingredients.find((line: { text: string }) =>
    line.text.includes("tomato paste")
  )
const standIns = (ingredientId: string) =>
  kyle.post("/api/recipes/tomato-pasta/stand-ins", { ingredientId })
const note = (body: Record<string, unknown>) =>
  kyle.post("/api/recipes/tomato-pasta/cook-notes", body)

describe("without AI", () => {
  test("stand-ins say how to get it, and a note is just kept", async () => {
    const res = await standIns((await paste()).id)
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe("ai_noKey")

    const noted = await note({ rating: 4, note: "Needed more salt." })
    expect(noted.status).toBe(201)
    expect(await noted.json()).toMatchObject({
      note: "Needed more salt.",
      suggesting: false,
    })
  })
})

describe("with AI", () => {
  beforeAll(async () => {
    const key = await kyle.post("/api/settings/server/ai/keys", {
      provider: "anthropic",
      key: GOOD_KEYS.anthropic,
    })
    expect(key.status, await key.clone().text()).toBe(201)
    await kyle.put("/api/households/current/tastes", {
      avoid: [{ food: "mushroom", level: "never", who: null }],
      diets: ["vegetarian"],
      weeknightMinutes: null,
    })
    await kyle.post("/api/pantry/items", {
      text: "tomato sauce",
      storedIn: "cupboard",
    })
  })

  describe("stand-ins", () => {
    test("work in the recipe, knowing what's at home and what's avoided", async () => {
      const line = await paste()
      const res = await standIns(line.id)
      expect(res.status, await res.clone().text()).toBe(200)
      const recipe = await pasta()
      expect(await res.json()).toEqual({
        swaps: [
          {
            lines: ["1 cup tomato sauce", "a pinch of sugar"],
            note: "Simmer it down so it's thick; a little sweeter.",
            atHome: true,
            steps: [
              {
                stepId: recipe.steps[1].id,
                text: "Stir in the tomato sauce and sugar and simmer 12 minutes, until thick.",
              },
            ],
          },
        ],
      })
      expect(prompt()).toContain("Instead of: 2 tbsp tomato paste")
      expect(prompt()).toContain("At home: tomato sauce")
      expect(prompt()).toContain("never has: mushroom")
      expect(prompt()).toContain("Every meal must be: vegetarian")
      expect(prompt()).toContain("2. Stir in the tomato paste")
    })

    test("are for an ingredient the recipe has", async () => {
      const res = await standIns("not-an-ingredient")
      expect(res.status).toBe(404)
    })
  })

  describe("saving a swap", () => {
    test("changes the recipe, keeping a version to undo with", async () => {
      const line = await paste()
      const recipe = await pasta()
      const res = await kyle.post("/api/recipes/tomato-pasta/swap", {
        ingredientId: line.id,
        lines: ["1 cup tomato sauce", "a pinch of sugar"],
        steps: [
          {
            stepId: recipe.steps[1].id,
            text: "Stir in the tomato sauce and simmer 12 minutes.",
          },
        ],
      })
      expect(res.status, await res.clone().text()).toBe(200)
      const { recipe: swapped, undoVersionId } = await res.json()
      expect(swapped.ingredients.map((l: { text: string }) => l.text)).toEqual([
        "8 oz pasta",
        "1 cup tomato sauce",
        "a pinch of sugar",
        "1 cup cream",
        "parsley, to serve",
      ])
      expect(swapped.steps[1].text).toBe(
        "Stir in the tomato sauce and simmer 12 minutes."
      )
      const versions = await (
        await kyle.get("/api/recipes/tomato-pasta/versions")
      ).json()
      expect((versions.versions ?? versions)[0]).toMatchObject({
        id: undoVersionId,
        source: "swap",
      })

      // Undone: as it was.
      const undo = await kyle.post(
        `/api/recipes/tomato-pasta/versions/${undoVersionId}/restore`
      )
      expect(undo.status, await undo.clone().text()).toBe(200)
      expect((await pasta()).ingredients[1].text).toBe("2 tbsp tomato paste")
    })

    test("is refused when the recipe changed since", async () => {
      const res = await kyle.post("/api/recipes/tomato-pasta/swap", {
        ingredientId: "gone",
        lines: ["1 cup tomato sauce"],
      })
      expect(res.status).toBe(409)
      expect((await res.json()).error.code).toBe("recipe_changed")
    })
  })

  describe("a cooking note", () => {
    const waiting = async () =>
      (await (await kyle.get("/api/proposals?recipe=tomato-pasta")).json())
        .proposals

    test("becomes a suggested change, in Review", async () => {
      const res = await note({
        rating: 4,
        note: "Needed 5 more minutes and a bit of salt.",
      })
      expect(res.status, await res.clone().text()).toBe(201)
      expect((await res.json()).suggesting).toBe(true)
      await jobs.drain()

      const [proposal] = await waiting()
      expect(proposal).toMatchObject({
        kind: "note",
        note: "Needed 5 more minutes and a bit of salt.",
        summary: "Adds salt and 5 more minutes.",
        sections: ["ingredients", "details"],
        after: {
          details: {
            servings: 4,
            prepMinutes: 5,
            cookMinutes: 20,
            totalMinutes: null,
          },
        },
      })
      expect(prompt()).toContain(
        "The cook's note:\nNeeded 5 more minutes and a bit of salt."
      )

      const applied = await kyle.post(`/api/proposals/${proposal.id}/apply`, {
        sections: ["ingredients", "details"],
      })
      expect(applied.status, await applied.clone().text()).toBe(200)
      const { recipe } = await applied.json()
      expect(recipe.cookMinutes).toBe(20)
      expect(recipe.ingredients.at(-1).text).toBe("1 tsp salt")
      const versions = await (
        await kyle.get("/api/recipes/tomato-pasta/versions")
      ).json()
      expect((versions.versions ?? versions)[0].source).toBe("edit")
    })

    test("that's only an opinion is just kept", async () => {
      edit = () => ({ ...EDIT, change: false })
      await note({ rating: 5, note: "The kids loved it." })
      await jobs.drain()
      expect(await waiting()).toEqual([])
      edit = () => EDIT
    })

    test("can go in the notes, or be just stars", async () => {
      edit = () => ({
        ...EDIT,
        cookMinutes: null,
        ingredients: null,
        notes: "Great with garlic bread.",
      })
      await note({ rating: null, note: "Great with garlic bread." })
      await jobs.drain()
      const [proposal] = await waiting()
      expect(proposal).toMatchObject({
        sections: ["notes"],
        before: { notes: null },
        after: { notes: "Great with garlic bread." },
      })
      edit = () => EDIT

      const stars = await (await note({ rating: 3, note: null })).json()
      expect(stars.suggesting).toBe(false)
    })
  })
})
