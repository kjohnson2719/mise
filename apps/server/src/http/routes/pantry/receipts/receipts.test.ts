import sharp from "sharp"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../../app.ts"
import {
  fakeAiFetcher,
  GOOD_KEYS,
  mockAiModels,
  type MockCall,
} from "../../../../test/ai.ts"
import {
  account,
  createTestApp,
  inviteToken,
  join,
  setUpServer,
  TestClient,
} from "../../../../test/app.ts"

// Receipts into the pantry. The model answers with `read`, and what it was
// given last is kept in `given`.

type Part = { type: string; text?: string; mediaType?: string }
type Prompt = { role: string; content: string | Part[] }[]

const WALMART = {
  what: "receipt",
  store: "Walmart",
  date: "2026-10-14",
  total: 21.45,
  items: [
    {
      text: "GV WHL MLK 1GAL",
      name: "whole milk",
      amount: "1 gal",
      price: 3.48,
      kind: "food",
    },
    {
      text: "BNLS SKNLS CHKN THGH",
      name: "boneless skinless chicken thighs",
      amount: "2.3 lb",
      price: 9.17,
      kind: "food",
    },
    {
      text: "BOUNTY 6RL",
      name: "paper towels",
      amount: "6 rolls",
      price: 8.8,
      kind: "household",
    },
    { text: "", name: "  ", amount: null, price: null, kind: "food" },
  ],
}

let read: object = WALMART
let given: Part[] = []
let system = ""
const reply = (call: MockCall) => {
  const prompt = call.prompt as Prompt
  system = (prompt.find((m) => m.role === "system")?.content as string) ?? ""
  given = prompt
    .filter((m) => m.role === "user")
    .flatMap((m) => m.content as Part[])
  return JSON.stringify(read)
}

let app: App
let close: () => Promise<void>
let kyle: TestClient
let sam: TestClient
let jpeg: Buffer

beforeAll(async () => {
  const test = await createTestApp({
    fetcher: fakeAiFetcher(),
    ai: mockAiModels(undefined, [], undefined, reply),
  })
  ;({ app, close } = test)
  kyle = await setUpServer(app, test.setupCode)
  const home = (await (await kyle.get("/api/households/current")).json()).id
  // Sam is in another household, the Cabin.
  await kyle.post("/api/households", { name: "Cabin" })
  sam = await join(app, await inviteToken(kyle), account("sam", "Sam"))
  await kyle.post("/api/auth/organization/set-active", { organizationId: home })
  const key = await kyle.post("/api/settings/server/ai/keys", {
    provider: "anthropic",
    key: GOOD_KEYS.anthropic,
  })
  expect(key.status, await key.clone().text()).toBe(201)
  jpeg = await sharp({
    create: { width: 600, height: 800, channels: 3, background: "#eee" },
  })
    .jpeg()
    .toBuffer()
})

afterAll(() => close())

/** A receipt sent the way the web app sends it. */
async function scan(fields: [string, string | Blob][], who: TestClient = kyle) {
  const data = new FormData()
  for (const [name, value] of fields) data.append(name, value)
  const request = new Request("http://merran.test", {
    method: "POST",
    body: data,
  })
  return who.send("POST", "/api/pantry/receipts", {
    body: new Uint8Array(await request.arrayBuffer()),
    type: request.headers.get("content-type")!,
  })
}

const photo = (body: Buffer, name = "receipt.jpg") =>
  ["file", new File([new Uint8Array(body)], name)] as [string, Blob]

type Line = {
  id: string
  name: string
  amount: string | null
  kind: string
  listItem: { id: string; name: string } | null
}

async function scanned() {
  const res = await scan([photo(jpeg)])
  expect(res.status, await res.clone().text()).toBe(201)
  return (await res.json()) as {
    id: string
    lines: Line[]
    files: { url: string }[]
  }
}

describe("scanning a receipt", () => {
  test("reads its lines to look over, matched to the shopping list", async () => {
    await kyle.post("/api/list/items", { text: "milk" })
    await kyle.post("/api/list/items", { text: "2 lb chicken thighs" })
    await kyle.post("/api/list/items", { text: "bananas" })

    const receipt = await scanned()
    expect(receipt).toMatchObject({
      store: "Walmart",
      date: "2026-10-14",
      total: 21.45,
    })
    // The blank line is dropped.
    expect(receipt.lines.map((line) => [line.name, line.amount])).toEqual([
      ["whole milk", "1 gal"],
      ["boneless skinless chicken thighs", "2.3 lb"],
      ["paper towels", "6 rolls"],
    ])
    expect(receipt.lines.map((line) => line.listItem?.name ?? null)).toEqual([
      "milk",
      "chicken thighs",
      null,
    ])
    expect(system).toContain("You read grocery receipts")
    expect(given.map((part) => part.mediaType ?? part.text)).toEqual([
      "image/jpeg",
      "Read this receipt.",
    ])

    // The photo's kept, to compare with.
    const shown = await kyle.get(receipt.files[0]!.url)
    expect(shown.status).toBe(200)
    expect(shown.headers.get("content-type")).toBe("image/jpeg")
    await kyle.delete(`/api/pantry/receipts/${receipt.id}`)
  })

  test("a tall screenshot is cut into pieces, so the print stays readable", async () => {
    const tall = await sharp({
      create: { width: 400, height: 3000, channels: 3, background: "#fff" },
    })
      .png()
      .toBuffer()
    const res = await scan([photo(tall, "screenshot.png")])
    expect(res.status, await res.clone().text()).toBe(201)
    const pieces = given.filter((part) => part.mediaType === "image/jpeg")
    expect(pieces.length).toBeGreaterThan(2)
    await kyle.delete(`/api/pantry/receipts/${(await res.json()).id}`)
  })

  test("its text, or a PDF of it, is read too", async () => {
    const text = await scan([
      ["text", "<p>Whole milk 1 gal $3.48</p><p>Total $3.48</p>"],
    ])
    expect(text.status, await text.clone().text()).toBe(201)
    expect(given.at(-1)!.text).toBe(
      "The receipt:\n\nWhole milk 1 gal $3.48\nTotal $3.48"
    )
    expect((await text.json()).files).toEqual([])

    const pdf = await scan([
      ["file", new File(["%PDF-1.7 receipt"], "order.pdf")],
    ])
    expect(pdf.status, await pdf.clone().text()).toBe(201)
    expect(given[0]).toMatchObject({
      type: "file",
      mediaType: "application/pdf",
    })
  })

  test("says when it's a recipe, or nothing it can read", async () => {
    read = { ...WALMART, what: "recipe", items: [] }
    const recipe = await scan([photo(jpeg)])
    expect(recipe.status).toBe(422)
    expect((await recipe.json()).error.code).toBe("receipt_is_recipe")

    read = { ...WALMART, what: "other", items: [] }
    const other = await scan([photo(jpeg)])
    expect((await other.json()).error.code).toBe("not_a_receipt")
    read = WALMART

    expect((await scan([])).status).toBe(400)
    const notPhoto = await scan([["file", new File(["hello"], "a.bin")]])
    expect(notPhoto.status).toBe(400)
  })
})

describe("adding a receipt", () => {
  test("puts what's picked in the pantry, as named, and takes it off the list", async () => {
    const receipt = await scanned()
    const [milk, chicken, towels] = receipt.lines
    const res = await kyle.post(`/api/pantry/receipts/${receipt.id}/add`, {
      items: [
        { id: milk!.id, name: "whole milk", amount: "1 gallon" },
        { id: chicken!.id, name: "chicken thighs", amount: "2.3 lb" },
        // Not one of its lines.
        { id: "madeup", name: "caviar", amount: null },
      ],
    })
    expect(res.status, await res.clone().text()).toBe(200)
    expect(await res.json()).toEqual({ added: 2, offTheList: 2 })

    const pantry = (await (await kyle.get("/api/pantry")).json()).items as {
      name: string
      quantity: number | null
      unit: string | null
      storedIn: string | null
    }[]
    expect(pantry.find((item) => item.name === "whole milk")).toMatchObject({
      quantity: 1,
      unit: "gallon",
      storedIn: "fridge",
    })
    expect(pantry.find((item) => item.name === "chicken thighs")).toMatchObject(
      { quantity: 2.3, unit: "pound" }
    )
    expect(pantry.some((item) => item.name === towels!.name)).toBe(false)

    const list = (await (await kyle.get("/api/list")).json()).items as {
      name: string
    }[]
    expect(list.map((item) => item.name)).toEqual(["bananas"])

    // The receipt's done with, and its photo gone.
    expect((await kyle.get(`/api/pantry/receipts/${receipt.id}`)).status).toBe(
      404
    )
    expect((await kyle.get(receipt.files[0]!.url)).status).toBe(404)
  })

  test("needs something picked", async () => {
    const receipt = await scanned()
    const res = await kyle.post(`/api/pantry/receipts/${receipt.id}/add`, {
      items: [],
    })
    expect(res.status).toBe(400)
    await kyle.delete(`/api/pantry/receipts/${receipt.id}`)
  })

  test("a discarded receipt is gone, and each household's are its own", async () => {
    const receipt = await scanned()
    expect((await sam.get(`/api/pantry/receipts/${receipt.id}`)).status).toBe(
      404
    )
    expect((await sam.get(receipt.files[0]!.url)).status).toBe(404)
    const add = await sam.post(`/api/pantry/receipts/${receipt.id}/add`, {
      items: [{ id: receipt.lines[0]!.id, name: "milk", amount: null }],
    })
    expect(add.status).toBe(404)

    expect(
      (await kyle.delete(`/api/pantry/receipts/${receipt.id}`)).status
    ).toBe(204)
    expect((await kyle.get(`/api/pantry/receipts/${receipt.id}`)).status).toBe(
      404
    )
  })
})

describe("sharing a receipt", () => {
  test("opens it to look over", async () => {
    const data = new FormData()
    data.append("file", new File([new Uint8Array(jpeg)], "IMG_0001.jpg"))
    const request = new Request("http://merran.test", {
      method: "POST",
      body: data,
    })
    const res = await kyle.send("POST", "/api/share", {
      body: new Uint8Array(await request.arrayBuffer()),
      type: request.headers.get("content-type")!,
    })
    const body = await res.json()
    expect(body).toMatchObject({
      outcome: "receipt",
      message:
        "Read a receipt from Walmart: 3 things to look over for the pantry.",
      url: expect.stringMatching(/\/pantry\/receipts\/[0-9a-f-]+$/),
    })
    // It waits on the Pantry page, for when Merran's opened.
    const waiting = (await (await kyle.get("/api/pantry/receipts")).json())
      .receipts as { id: string }[]
    expect(waiting.map((receipt) => receipt.id)).toContain(body.receiptId)
    expect(
      (await (await sam.get("/api/pantry/receipts")).json()).receipts
    ).toEqual([])
  })
})
