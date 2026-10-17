import { gzipSync } from "node:zlib"
import sharp from "sharp"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import yazl from "yazl"
import type { Fetcher } from "../../../../../../services/fetch/public-fetch.ts"
import type { JobRunner } from "../../../../../../services/jobs/runner.ts"
import {
  createTestApp,
  setUpServer,
  TestClient,
} from "../../../../../../test/app.ts"

// Paprika exports: a .paprikarecipes zip of gzipped recipes, or one
// .paprikarecipe on its own, made here the way Paprika writes them.

let close: () => Promise<void>
let jobs: JobRunner
let kyle: TestClient
let bigPhoto: Buffer
let smallPhoto: Buffer
const fetched: string[] = []

const PHOTO_LINK = "https://example.com/photos/stew.jpg"

const fetcher: Fetcher = async (url) => {
  fetched.push(url)
  if (url !== PHOTO_LINK) throw new Error("Not found")
  return { url, status: 200, contentType: "image/jpeg", body: bigPhoto }
}

const photo = (size: number) =>
  sharp({
    create: { width: size, height: size, channels: 3, background: "#c63" },
  })
    .jpeg()
    .toBuffer()

function zipOf(files: [string, Buffer][]) {
  const zip = new yazl.ZipFile()
  for (const [name, content] of files) zip.addBuffer(content, name)
  zip.end()
  return new Promise<Uint8Array>((resolve, reject) => {
    const chunks: Buffer[] = []
    zip.outputStream.on("data", (chunk: Buffer) => chunks.push(chunk))
    zip.outputStream.on("end", () => resolve(Buffer.concat(chunks)))
    zip.outputStream.on("error", reject)
  })
}

const paprika = (recipe: object) => gzipSync(JSON.stringify(recipe))

async function importFile(zip: Uint8Array, type = "application/zip") {
  const checked = await kyle.upload(
    "/api/households/current/import/files",
    zip,
    type,
    "POST"
  )
  expect(checked.status).toBe(200)
  const file = await checked.json()
  const started = await kyle.post(
    `/api/households/current/import/files/${file.id}/start`,
    {}
  )
  expect(started.status).toBe(202)
  await jobs.drain()
  const job = await (
    await kyle.get(`/api/households/current/jobs/${(await started.json()).id}`)
  ).json()
  return { file, job }
}

let exported: Uint8Array

beforeAll(async () => {
  bigPhoto = await photo(800)
  smallPhoto = await photo(120)
  const test = await createTestApp({ fetcher })
  ;({ close, jobs } = test)
  kyle = await setUpServer(test.app, test.setupCode)

  // Two recipes named alike, as Paprika allows, one in the trash, and the
  // Mac's leftovers from zipping it again.
  exported = await zipOf([
    [
      "Soup.paprikarecipe",
      paprika({
        uid: "AAAA-1",
        name: "Soup",
        ingredients: "1 onion\n2 cans tomatoes",
        directions: "Simmer for 20 minutes.",
        categories: ["Soups"],
        rating: 5,
        prep_time: "10 mins",
        photo_data: bigPhoto.toString("base64"),
      }),
    ],
    [
      "Soup.paprikarecipe",
      paprika({
        uid: "AAAA-2",
        name: "Soup",
        ingredients: "500 g beef\n2 carrots",
        directions: "1. Brown the beef.\n\n2. Stew for 2 hours.",
        image_url: PHOTO_LINK,
        photo_data: smallPhoto.toString("base64"),
      }),
    ],
    [
      "Old.paprikarecipe",
      paprika({ uid: "AAAA-3", name: "Old", in_trash: true }),
    ],
    ["__MACOSX/._Soup.paprikarecipe", Buffer.from("mac")],
  ])
})

afterAll(() => close())

describe("a Paprika export", () => {
  test("comes in, photos and all, without what's in the trash", async () => {
    const { file, job } = await importFile(exported)
    expect(file).toMatchObject({
      app: "paprika",
      what: "recipes",
      recipes: 2,
      alreadyHere: 0,
    })
    expect(job.result).toMatchObject({
      recipes: 2,
      photos: 2,
      skipped: 0,
      failed: 0,
    })

    const soup = await (await kyle.get("/api/recipes/soup")).json()
    expect(soup).toMatchObject({
      origin: "paprika",
      rating: 5,
      prepMinutes: 10,
      tags: ["Soups"],
      ingredients: [{ text: "1 onion" }, { text: "2 cans tomatoes" }],
      steps: [{ text: "Simmer for 20 minutes." }],
    })
    expect(soup.photo).not.toBeNull()

    // Its own photo was small, so the original was fetched from its link.
    const stew = await (await kyle.get("/api/recipes/soup-2")).json()
    expect(stew).toMatchObject({
      steps: [{ text: "Brown the beef." }, { text: "Stew for 2 hours." }],
    })
    expect(stew.photo).not.toBeNull()
    expect(fetched).toEqual([PHOTO_LINK])
  })

  test("imported again, brings in nothing twice", async () => {
    const { file, job } = await importFile(exported)
    expect(file).toMatchObject({ recipes: 2, alreadyHere: 2 })
    expect(job.result).toMatchObject({ recipes: 0, skipped: 2 })
  })
})

describe("one Paprika recipe on its own", () => {
  test("comes in too", async () => {
    const { file, job } = await importFile(
      paprika({
        uid: "BBBB-1",
        name: "Flatbread",
        ingredients: "300 g flour",
        directions: "Mix.\nCook in a hot pan.",
      }),
      "application/octet-stream"
    )
    expect(file).toMatchObject({ app: "paprika", recipes: 1 })
    expect(job.result).toMatchObject({ recipes: 1, photos: 0 })
    const flatbread = await (await kyle.get("/api/recipes/flatbread")).json()
    expect(flatbread.steps).toMatchObject([
      { text: "Mix." },
      { text: "Cook in a hot pan." },
    ])
  })
})
