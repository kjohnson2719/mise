import { addDays } from "@merran/shared"
import sharp from "sharp"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../app.ts"
import { AppError } from "../../../core/errors.ts"
import type { Fetcher } from "../../../services/fetch/public-fetch.ts"
import type { JobRunner } from "../../../services/jobs/runner.ts"
import {
  fakeAiFetcher,
  GOOD_KEYS,
  mockAiModels,
  type MockCall,
  type MockReply,
} from "../../../test/ai.ts"
import {
  account,
  createTestApp,
  inviteToken,
  join,
  setUpServer,
  TestClient,
} from "../../../test/app.ts"

// The assistant and Discover. The model answers the assistant from
// `script`, a reply at a time (tool calls, then text), and Discover with
// `picks`. What it was told last is kept in `asked`.

type Prompt = {
  role: string
  content: string | { type: string; text?: string }[]
}[]

let script: MockReply[] = []
let picks: { url: string; name: string; why: string }[] = []
let asked: Prompt = []
const reply = (call: MockCall): MockReply => {
  const prompt = call.prompt as Prompt
  const system = prompt.find((m) => m.role === "system")?.content
  if (typeof system !== "string") return "ok"
  if (system.startsWith("You're the kitchen assistant")) {
    asked = prompt
    return script.shift() ?? "Done."
  }
  if (system.startsWith("You read grocery receipts")) {
    return JSON.stringify({
      what: "receipt",
      store: "Kroger",
      date: null,
      total: 6.98,
      items: [
        {
          text: "KRO EGGS LG 12",
          name: "eggs",
          amount: "12 ct",
          price: 3.49,
          kind: "food",
        },
        {
          text: "DAWN DISH",
          name: "dish soap",
          amount: null,
          price: 3.49,
          kind: "household",
        },
      ],
    })
  }
  if (system.startsWith("You find recipes online")) {
    return {
      toolCalls: [{ toolName: "offer_recipes", input: { recipes: picks } }],
    }
  }
  return "ok"
}
const system = () => asked.find((m) => m.role === "system")?.content as string

/** A recipe page with its recipe data, as most sites have. */
const page = (name: string) =>
  `<!doctype html><html><head><script type="application/ld+json">${JSON.stringify(
    {
      "@type": "Recipe",
      name,
      totalTime: "PT40M",
      image: "https://photos.example/soup.jpg",
      recipeIngredient: ["1 squash", "1 onion"],
      recipeInstructions: [{ "@type": "HowToStep", text: "Roast and blend." }],
    }
  )}</script></head><body>${name}</body></html>`

const web = new Map<string, string>([
  ["https://soups.example/squash", page("Squash Soup")],
  ["https://soups.example/leek", page("Leek Soup")],
  ["https://soups.example/onion", page("Onion Soup")],
  ["https://soups.example/blog", "<html><body>Ten soups we love</body></html>"],
  ["https://stews.example/lentil", page("Lentil Stew")],
  ["https://stews.example/bean", page("Bean Stew")],
])
const aiFetcher = fakeAiFetcher()
const fetcher: Fetcher = async (url, options) => {
  const body = web.get(url)
  if (body === undefined) {
    if (/\.example\//.test(url)) {
      throw new AppError("upstream", "site_unreachable", "Couldn't reach it.")
    }
    return aiFetcher(url, options)
  }
  return {
    url,
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: Buffer.from(body),
  }
}

let app: App
let jobs: JobRunner
let close: () => Promise<void>
let kyle: TestClient
let sam: TestClient
let chickenId: string

beforeAll(async () => {
  const test = await createTestApp({
    fetcher,
    ai: mockAiModels(undefined, [], undefined, reply),
  })
  ;({ app, jobs, close } = test)
  kyle = await setUpServer(app, test.setupCode)
  sam = await join(app, await inviteToken(kyle), account("sam", "Sam"))
  const chicken = await kyle.post("/api/recipes", {
    name: "Lemon Chicken",
    servings: 4,
    tags: ["Dinner"],
    ingredients: ["2 lb chicken thighs", "2 lemons"],
    steps: ["Roast with the lemons."],
  })
  chickenId = (await chicken.json()).id
})

afterAll(() => close())

/** The UI message stream, as its chunks. */
async function chunks(res: Response) {
  const text = await res.text()
  return text
    .split("\n")
    .filter((line) => line.startsWith("data: ") && line !== "data: [DONE]")
    .map((line) => JSON.parse(line.slice(6)) as Record<string, unknown>)
}

const startChat = async (who = kyle) => {
  const res = await who.post("/api/assistant/chats")
  expect(res.status, await res.clone().text()).toBe(201)
  return (await res.json()).id as string
}

const send = (chatId: string, text: string, context?: object, who = kyle) =>
  who.post(`/api/assistant/chats/${chatId}/messages`, { text, context })

/** A photo or PDF, uploaded the way the web app does. */
async function uploadFile(body: Buffer | string, name: string, who = kyle) {
  const data = new FormData()
  data.append("file", new File([body], name))
  const request = new Request("http://merran.test", {
    method: "POST",
    body: data,
  })
  return who.send("POST", "/api/assistant/files", {
    body: new Uint8Array(await request.arrayBuffer()),
    type: request.headers.get("content-type")!,
  })
}

/** The smallest PDF there is: one empty page. */
const PDF = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >> endobj
trailer << /Root 1 0 R >>
%%EOF
`

/** The proposal a tool made, from the stream. */
const proposed = (parts: Record<string, unknown>[]) =>
  parts
    .filter((part) => part.type === "tool-output-available")
    .map(
      (part) => (part.output as { proposal?: Record<string, unknown> }).proposal
    )
    .filter(Boolean) as Record<string, unknown>[]

describe("without AI", () => {
  test("a message says how to get it, and isn't kept", async () => {
    const chatId = await startChat()
    const res = await send(chatId, "Hello")
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe("ai_noKey")
    const chat = await (await kyle.get(`/api/assistant/chats/${chatId}`)).json()
    expect(chat).toMatchObject({ title: "New chat", messages: [] })
  })
})

describe("the assistant", () => {
  beforeAll(async () => {
    const res = await kyle.post("/api/settings/server/ai/keys", {
      provider: "anthropic",
      key: GOOD_KEYS.anthropic,
    })
    expect(res.status, await res.clone().text()).toBe(201)
  })

  test("looks things up, streams its answer, and keeps the chat", async () => {
    const chatId = await startChat()
    script = [
      {
        toolCalls: [
          {
            toolName: "search_recipes",
            input: {
              query: "chicken",
              tag: null,
              maxMinutes: null,
              notMadeYet: null,
              limit: null,
            },
          },
        ],
      },
      "You have Lemon Chicken.",
    ]
    const res = await send(chatId, "What chicken recipes do we have?")
    expect(res.status, await res.clone().text()).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/event-stream")
    const parts = await chunks(res)
    const found = parts.find((part) => part.type === "tool-output-available")
    expect(found?.output).toMatchObject({
      total: 1,
      recipes: [{ id: chickenId, name: "Lemon Chicken", tags: ["Dinner"] }],
    })
    expect(parts).toContainEqual(
      expect.objectContaining({
        type: "text-delta",
        delta: "You have Lemon Chicken.",
      })
    )
    expect(system()).toContain("talking with Kyle")
    expect(system()).toContain("propose_meals")

    const chat = await (await kyle.get(`/api/assistant/chats/${chatId}`)).json()
    expect(chat.title).toBe("What chicken recipes do we have?")
    expect(chat.messages.map((m: { role: string }) => m.role)).toEqual([
      "user",
      "assistant",
    ])
    expect(
      chat.messages[1].parts.some(
        (part: { type: string }) => part.type === "tool-search_recipes"
      )
    ).toBe(true)

    // Carried on, it knows what was said.
    script = ["Roast it."]
    await (await send(chatId, "How do I cook it?")).text()
    expect(asked.filter((m) => m.role === "user")).toHaveLength(2)
    expect(
      (await (await kyle.get(`/api/assistant/chats/${chatId}`)).json()).messages
    ).toHaveLength(4)
  })

  test("knows what's on the screen", async () => {
    const chatId = await startChat()
    script = ["Yes."]
    await (
      await send(chatId, "Can I make this ahead?", { recipe: chickenId })
    ).text()
    expect(system()).toContain('On their screen: the recipe "Lemon Chicken"')
    expect(system()).toContain("2 lb chicken thighs")
  })

  test("proposes rather than changes, and each applies", async () => {
    const chatId = await startChat()
    const tomorrow = addDays(new Date().toISOString().slice(0, 10), 1)
    script = [
      {
        toolCalls: [
          {
            toolName: "propose_meals",
            input: {
              summary: "Lemon Chicken tomorrow.",
              meals: [
                {
                  date: tomorrow,
                  meal: "dinner",
                  recipe: "lemon chicken",
                  with: null,
                  note: null,
                  servings: null,
                },
              ],
            },
          },
          {
            toolName: "propose_list_items",
            input: { summary: "Rice.", items: ["2 cups rice", " "] },
          },
          {
            toolName: "propose_tastes",
            input: {
              summary: "Sam doesn't eat cilantro.",
              avoid: [{ food: "cilantro", level: "never", who: "Sam" }],
              diets: [],
              weeknightMinutes: null,
            },
          },
          {
            toolName: "propose_new_recipe",
            input: {
              summary: "A quick rice.",
              name: "Lemon Rice",
              description: null,
              servings: 4,
              prepMinutes: null,
              cookMinutes: 20,
              totalMinutes: null,
              tags: ["Side"],
              ingredients: ["1 cup rice", "1 lemon"],
              steps: ["Cook the rice.", "Stir in the lemon."],
              notes: null,
            },
          },
          {
            toolName: "propose_recipe_edit",
            input: {
              recipe: chickenId,
              summary: "Adds garlic.",
              description: null,
              servings: null,
              prepMinutes: null,
              cookMinutes: 45,
              totalMinutes: null,
              tags: null,
              ingredients: [
                "2 lb chicken thighs",
                "2 lemons",
                "4 cloves garlic",
              ],
              steps: null,
              notes: null,
            },
          },
        ],
      },
      "Here you go.",
    ]
    const parts = await chunks(await send(chatId, "Plan tomorrow and more"))
    const cards = proposed(parts)
    // The tools run at once, so they finish in any order.
    const kinds = ["meals", "list", "tastes", "recipe", "edit"]
    cards.sort(
      (a, b) =>
        kinds.indexOf(a.kind as string) - kinds.indexOf(b.kind as string)
    )
    expect(cards.map((card) => card.kind)).toEqual(kinds)
    expect(cards.every((card) => card.chat === chatId)).toBe(true)
    // Nothing's changed yet, and they aren't in Review.
    expect((await (await kyle.get("/api/proposals")).json()).total).toBe(0)
    expect((await (await kyle.get("/api/list")).json()).items).toHaveLength(0)

    const apply = async (id: unknown, body: object = {}) => {
      const res = await kyle.post(`/api/proposals/${id}/apply`, body)
      expect(res.status, await res.clone().text()).toBe(200)
      return res.json()
    }
    await apply(cards[0]!.id)
    const plan = await (
      await kyle.get(`/api/plan?from=${tomorrow}&to=${tomorrow}`)
    ).json()
    expect(plan.entries ?? plan).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          meal: "dinner",
          recipe: expect.objectContaining({ id: chickenId }),
        }),
      ])
    )
    await apply(cards[1]!.id)
    expect(
      (await (await kyle.get("/api/list")).json()).items.map(
        (item: { name: string }) => item.name
      )
    ).toEqual(["rice"])
    await apply(cards[2]!.id)
    expect(
      (await (await kyle.get("/api/households/current/tastes")).json()).avoid
    ).toEqual([{ food: "cilantro", level: "never", who: "Sam" }])
    const made = await apply(cards[3]!.id)
    expect(made.recipe).toMatchObject({
      name: "Lemon Rice",
      origin: "assistant",
    })
    const edited = await apply(cards[4]!.id, {
      sections: ["ingredients", "details"],
    })
    expect(edited.recipe.ingredients.at(-1).text).toBe("4 cloves garlic")
    expect(edited.recipe.cookMinutes).toBe(45)

    const again = await kyle.post(`/api/proposals/${cards[0]!.id}/apply`, {})
    expect(again.status).toBe(409)
    const card = await (await kyle.get(`/api/proposals/${cards[0]!.id}`)).json()
    expect(card.status).toBe("applied")
  })

  test("offers a recipe from the web once it's opened the page", async () => {
    const chatId = await startChat()
    script = [
      {
        toolCalls: [
          {
            toolName: "propose_import_recipe",
            input: { url: "https://soups.example/blog", why: "Cozy." },
          },
        ],
      },
      {
        toolCalls: [
          {
            toolName: "propose_import_recipe",
            input: { url: "https://soups.example/squash", why: "Cozy." },
          },
        ],
      },
      "Found one.",
    ]
    const parts = await chunks(await send(chatId, "Find me a soup online"))
    // The page with no recipe on it is refused, and the model tries again.
    expect(parts).toContainEqual(
      expect.objectContaining({
        type: "tool-output-error",
        errorText: expect.stringContaining("no recipe on it"),
      })
    )
    const [card] = proposed(parts)
    expect(card).toMatchObject({
      kind: "import",
      payload: { name: "Squash Soup", site: "soups.example", minutes: 40 },
    })
    const res = await kyle.post(`/api/proposals/${card!.id}/apply`, {})
    expect(res.status, await res.clone().text()).toBe(200)
    expect((await res.json()).recipe).toMatchObject({
      name: "Squash Soup",
      sourceUrl: "https://soups.example/squash",
    })
  })

  test("offers a swap, with the steps it changes, to save to the recipe", async () => {
    const pasta = await (
      await kyle.post("/api/recipes", {
        name: "Lemon Pasta",
        ingredients: ["8 oz spaghetti", "1 lemon", "2 tbsp butter"],
        steps: [
          "Boil the spaghetti.",
          "Zest and juice the lemon into the butter.",
        ],
      })
    ).json()
    const chatId = await startChat()
    script = [
      {
        toolCalls: [
          {
            toolName: "propose_swap",
            input: {
              recipe: "lemon pasta",
              ingredient: "saffron",
              lines: ["1 pinch turmeric"],
              note: "For color.",
              steps: [],
            },
          },
        ],
      },
      {
        toolCalls: [
          {
            toolName: "propose_swap",
            input: {
              recipe: "lemon pasta",
              ingredient: "lemon",
              lines: ["2 tbsp lime juice"],
              note: "Brighter, a little sharper.",
              steps: [
                { step: 1, text: "Boil the spaghetti." },
                { step: 2, text: "Stir the lime juice into the butter." },
              ],
            },
          },
        ],
      },
      "Lime works.",
    ]
    const parts = await chunks(
      await send(chatId, "I'm out of lemons", { recipe: pasta.id })
    )
    // A line it doesn't have is refused, with the lines it does.
    expect(parts).toContainEqual(
      expect.objectContaining({
        type: "tool-output-error",
        errorText: expect.stringContaining("1 lemon; 2 tbsp butter"),
      })
    )
    const [card] = proposed(parts)
    const lemon = pasta.ingredients[1]
    // Only the step it changes.
    expect(card).toMatchObject({
      kind: "swap",
      recipe: { id: pasta.id },
      payload: {
        ingredientId: lemon.id,
        insteadOf: "1 lemon",
        lines: ["2 tbsp lime juice"],
        note: "Brighter, a little sharper.",
        steps: [
          {
            stepId: pasta.steps[1].id,
            text: "Stir the lime juice into the butter.",
          },
        ],
      },
    })
    expect(system()).toContain("propose_swap")

    const res = await kyle.post(`/api/proposals/${card!.id}/apply`, {})
    expect(res.status, await res.clone().text()).toBe(200)
    const { recipe } = await res.json()
    expect(
      recipe.ingredients.map((line: { text: string }) => line.text)
    ).toEqual(["8 oz spaghetti", "2 tbsp lime juice", "2 tbsp butter"])
    expect(recipe.steps.map((step: { text: string }) => step.text)).toEqual([
      "Boil the spaghetti.",
      "Stir the lime juice into the butter.",
    ])
  })

  test("never plans what may have an allergy, even a recipe it can't read", async () => {
    const before = await (
      await kyle.get("/api/households/current/tastes")
    ).json()
    const tastes = await kyle.put("/api/households/current/tastes", {
      ...before,
      avoid: [
        ...before.avoid,
        { food: "peanuts", level: "allergy", who: "Emma" },
      ],
    })
    expect(tastes.status, await tastes.clone().text()).toBe(200)
    // Peanut baklava, kept in Arabic: its peanuts can't be seen.
    const baklava = await (
      await kyle.post("/api/recipes", {
        name: "بقلاوة بالفول السوداني",
        ingredients: ["250 غرام فول سوداني مطحون", "200 غرام زبدة مذابة"],
        steps: ["اخبزها حتى تصبح ذهبية."],
      })
    ).json()
    const noodles = await (
      await kyle.post("/api/recipes", {
        name: "Peanut Noodles",
        ingredients: ["8 oz rice noodles", "1/4 cup peanut butter"],
        steps: ["Toss together."],
      })
    ).json()
    const tomorrow = addDays(new Date().toISOString().slice(0, 10), 1)
    const dinnerOf = (recipe: string) => ({
      toolCalls: [
        {
          toolName: "propose_meals",
          input: {
            summary: "Dinner tomorrow.",
            meals: [
              {
                date: tomorrow,
                meal: "dinner",
                recipe,
                with: null,
                note: null,
                servings: null,
              },
            ],
          },
        },
      ],
    })
    const chatId = await startChat()
    script = [
      {
        toolCalls: [{ toolName: "get_recipe", input: { recipe: baklava.id } }],
      },
      dinnerOf(baklava.id),
      dinnerOf(noodles.id),
      {
        toolCalls: [
          {
            toolName: "propose_swap",
            input: {
              recipe: chickenId,
              ingredient: "2 lemons",
              lines: ["عصير ليمونتين"],
              note: "The same.",
              steps: [],
            },
          },
        ],
      },
      dinnerOf(chickenId),
      "Lemon Chicken, then.",
    ]
    const parts = await chunks(await send(chatId, "What's for dinner?"))
    const outputs = parts.filter(
      (part) => part.type === "tool-output-available"
    )
    expect(outputs[0]?.output).toMatchObject({
      doesntSuit: ["peanuts"],
      cantRead: expect.stringContaining("can't read its ingredients"),
    })
    const errors = parts
      .filter((part) => part.type === "tool-output-error")
      .map((part) => part.errorText)
    expect(errors).toEqual([
      expect.stringContaining(
        "can't check them for the household's allergies (peanuts)"
      ),
      expect.stringContaining("Peanut Noodles has peanuts"),
      expect.stringContaining("Write them in English"),
    ])
    // One it can read, with no peanuts, is planned as ever.
    const cards = proposed(parts)
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({
      kind: "meals",
      payload: { meals: [{ recipe: { id: chickenId } }] },
    })

    await kyle.put("/api/households/current/tastes", before)
    await kyle.delete(`/api/recipes/${baklava.id}`)
    await kyle.delete(`/api/recipes/${noodles.id}`)
    await kyle.delete(`/api/assistant/chats/${chatId}`)
  })

  test("sees photos sent with a message, which are each person's own", async () => {
    const png = await sharp({
      create: { width: 40, height: 30, channels: 3, background: "#c84" },
    })
      .png()
      .toBuffer()
    const notPhoto = await uploadFile("not a photo", "notes.txt")
    expect(notPhoto.status).toBe(400)
    const uploaded = await uploadFile(png, "pan.png")
    expect(uploaded.status, await uploaded.clone().text()).toBe(201)
    const photo = (await uploaded.json()) as { id: string; url: string }
    expect(photo).toMatchObject({
      url: `/api/assistant/files/${photo.id}`,
      mediaType: "image/jpeg",
    })

    const shown = await kyle.get(photo.url)
    expect(shown.status).toBe(200)
    expect(shown.headers.get("content-type")).toBe("image/jpeg")
    expect((await sam.get(photo.url)).status).toBe(404)
    // Sam can't delete it either; one taken out before sending is deleted.
    expect((await sam.delete(photo.url)).status).toBe(204)
    expect((await kyle.get(photo.url)).status).toBe(200)
    const unsent = (await (await uploadFile(png, "other.png")).json()) as {
      url: string
    }
    expect((await kyle.delete(unsent.url)).status).toBe(204)
    expect((await kyle.get(unsent.url)).status).toBe(404)

    const chatId = await startChat()
    // Neither words nor a file is nothing to send.
    expect((await send(chatId, " ")).status).toBe(400)
    const samsChat = await startChat(sam)
    const someoneElses = await sam.post(
      `/api/assistant/chats/${samsChat}/messages`,
      { files: [{ id: photo.id }] }
    )
    expect(someoneElses.status).toBe(404)
    await sam.delete(`/api/assistant/chats/${samsChat}`)

    script = ["It needs a few more minutes: the edges are still pale."]
    const res = await kyle.post(`/api/assistant/chats/${chatId}/messages`, {
      files: [{ id: photo.id, name: "pan.png" }],
    })
    expect(res.status, await res.clone().text()).toBe(200)
    await chunks(res)
    // The model sees the photo itself, and is told what to do with one.
    const said = asked.at(-1)!.content as { type: string; mediaType?: string }[]
    expect(said).toEqual([
      expect.objectContaining({ type: "file", mediaType: "image/jpeg" }),
    ])
    expect(system()).toContain("Photos of what they're cooking")

    // Kept as a link to the photo, not the photo.
    const chat = await (await kyle.get(`/api/assistant/chats/${chatId}`)).json()
    expect(chat.messages[0].parts).toEqual([
      {
        type: "file",
        mediaType: "image/jpeg",
        url: photo.url,
        filename: "pan.png",
      },
    ])
    expect(chat.title).toBe("New chat")

    // Deleting the chat deletes its files.
    expect((await kyle.delete(`/api/assistant/chats/${chatId}`)).status).toBe(
      204
    )
    expect((await kyle.get(photo.url)).status).toBe(404)
  })

  test("reads a recipe from a PDF, which it offers to draft", async () => {
    const uploaded = await uploadFile(PDF, "lasagna.pdf")
    expect(uploaded.status, await uploaded.clone().text()).toBe(201)
    const pdf = (await uploaded.json()) as { id: string; url: string }
    expect(pdf).toMatchObject({ mediaType: "application/pdf" })
    const shown = await kyle.get(pdf.url)
    expect(shown.headers.get("content-type")).toBe("application/pdf")
    expect(Buffer.from(await shown.arrayBuffer()).toString()).toBe(PDF)

    const chatId = await startChat()
    script = ["Here it is as a recipe."]
    const res = await kyle.post(`/api/assistant/chats/${chatId}/messages`, {
      text: "Add this one",
      files: [{ id: pdf.id, name: "lasagna.pdf" }],
    })
    expect(res.status, await res.clone().text()).toBe(200)
    await chunks(res)
    expect(asked.at(-1)!.content).toEqual([
      expect.objectContaining({
        type: "file",
        mediaType: "application/pdf",
        filename: "lasagna.pdf",
      }),
      { type: "text", text: "Add this one" },
    ])
    expect(system()).toContain("A recipe in a photo or a PDF")
    await kyle.delete(`/api/assistant/chats/${chatId}`)
  })

  test("reads a receipt sent with a message, for the pantry", async () => {
    const png = await sharp({
      create: { width: 300, height: 400, channels: 3, background: "#fff" },
    })
      .png()
      .toBuffer()
    const photo = (await (await uploadFile(png, "receipt.png")).json()) as {
      id: string
    }
    const chatId = await startChat()
    script = [
      { toolCalls: [{ toolName: "scan_receipt", input: {} }] },
      "Read 2 things from Kroger: look it over to add them.",
    ]
    const res = await kyle.post(`/api/assistant/chats/${chatId}/messages`, {
      text: "Put this away",
      files: [{ id: photo.id, name: "receipt.png" }],
    })
    expect(res.status, await res.clone().text()).toBe(200)
    const parts = await chunks(res)
    const output = parts.find((part) => part.type === "tool-output-available")
      ?.output as { receipt: { id: string } }
    expect(output.receipt).toMatchObject({
      store: "Kroger",
      lines: 2,
      food: 1,
      onList: 0,
    })
    const receipt = await kyle.get(`/api/pantry/receipts/${output.receipt.id}`)
    expect(receipt.status).toBe(200)
    expect(system()).toContain("scan_receipt")

    // Without a file, it says to add one.
    script = [{ toolCalls: [{ toolName: "scan_receipt", input: {} }] }, "Ok."]
    const none = await chunks(await send(chatId, "And this one"))
    expect(none).toContainEqual(
      expect.objectContaining({
        type: "tool-output-error",
        errorText: expect.stringContaining("Ask them to add the receipt"),
      })
    )
    await kyle.delete(`/api/pantry/receipts/${output.receipt.id}`)
    await kyle.delete(`/api/assistant/chats/${chatId}`)
  })

  test("a tool that fails tells the model, which carries on", async () => {
    const chatId = await startChat()
    script = [
      {
        toolCalls: [
          { toolName: "get_recipe", input: { recipe: "beef wellington" } },
        ],
      },
      "You don't have that one.",
    ]
    const parts = await chunks(await send(chatId, "Show me beef wellington"))
    expect(parts).toContainEqual(
      expect.objectContaining({
        type: "tool-output-error",
        errorText: expect.stringContaining("no recipe like"),
      })
    )
    expect(parts).toContainEqual(
      expect.objectContaining({ delta: "You don't have that one." })
    )
  })

  test("chats are each person's own", async () => {
    const chatId = await startChat()
    expect((await sam.get(`/api/assistant/chats/${chatId}`)).status).toBe(404)
    expect((await send(chatId, "Hi", undefined, sam)).status).toBe(404)
    const mine = await (await kyle.get("/api/assistant/chats")).json()
    expect(mine.chats.length).toBeGreaterThan(1)
    expect(
      (await (await sam.get("/api/assistant/chats")).json()).chats
    ).toEqual([])

    expect((await kyle.delete(`/api/assistant/chats/${chatId}`)).status).toBe(
      204
    )
    expect((await kyle.get(`/api/assistant/chats/${chatId}`)).status).toBe(404)
  })
})

describe("Discover", () => {
  test("keeps pages it can open, a couple from a site, and none from the library", async () => {
    picks = [
      {
        url: "https://soups.example/squash",
        name: "Squash",
        why: "In the library.",
      },
      { url: "https://soups.example/leek", name: "Leek", why: "Silky." },
      { url: "https://soups.example/onion", name: "Onion", why: "Rich." },
      { url: "https://soups.example/blog", name: "Blog", why: "Not a recipe." },
      { url: "https://stews.example/lentil", name: "Lentil", why: "Hearty." },
      { url: "https://stews.example/bean", name: "Bean", why: "Cheap." },
    ]
    const res = await kyle.post("/api/discover", { theme: "cozy soups" })
    expect(res.status, await res.clone().text()).toBe(202)
    const started = await res.json()
    expect(started).toMatchObject({ status: "searching", theme: "cozy soups" })
    expect((await kyle.post("/api/discover", { theme: "more" })).status).toBe(
      409
    )

    await jobs.drain()
    const done = await (await kyle.get(`/api/discover/${started.id}`)).json()
    expect(done).toMatchObject({ status: "done", error: null })
    expect(done.recipes.map((recipe: { name: string }) => recipe.name)).toEqual(
      ["Leek Soup", "Onion Soup", "Lentil Stew", "Bean Stew"]
    )
    expect(done.recipes[0]).toMatchObject({
      site: "soups.example",
      minutes: 40,
      photo: "https://photos.example/soup.jpg",
      why: "Silky.",
    })
    const { searches } = await (await kyle.get("/api/discover")).json()
    expect(searches[0].id).toBe(started.id)
  })

  test("says when nothing opens", async () => {
    picks = [{ url: "https://soups.example/blog", name: "Blog", why: "No." }]
    const started = await (
      await kyle.post("/api/discover", { theme: "plain toast" })
    ).json()
    await jobs.drain()
    const done = await (await kyle.get(`/api/discover/${started.id}`)).json()
    expect(done).toMatchObject({
      status: "done",
      recipes: [],
      error: expect.stringContaining("Try another theme"),
    })
  })
})
