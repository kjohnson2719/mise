import sharp from "sharp"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import yazl from "yazl"
import type { JobRunner } from "../../../../../../services/jobs/runner.ts"
import {
  account,
  createTestApp,
  inviteToken,
  join,
  setUpServer,
  TestClient,
} from "../../../../../../test/app.ts"

// Mealie files: a backup (Admin → Backups) and recipes exported from it,
// made here the way Mealie writes them.

let close: () => Promise<void>
let jobs: JobRunner
let kyle: TestClient
let jamie: TestClient

const GROUP = "0f0e0d0c0b0a49088f7e6d5c4b3a2918"
const OTHER_GROUP = "1f0e0d0c0b0a49088f7e6d5c4b3a2918"
// Mealie on SQLite keeps ids without dashes; its photo folders have them.
const SOUP = "945c1294d8a84f91a09114854680dc6e"
const SOUP_FOLDER = "945c1294-d8a8-4f91-a091-14854680dc6e"
const BREAD = "a45c1294d8a84f91a09114854680dc6f"
const KYLE = "11111111222233334444555555555555"
const SOMEONE = "21111111222233334444555555555555"

function zipOf(files: Record<string, Buffer | string>) {
  const zip = new yazl.ZipFile()
  for (const [name, content] of Object.entries(files)) {
    zip.addBuffer(Buffer.from(content), name)
  }
  zip.end()
  return new Promise<Uint8Array>((resolve, reject) => {
    const chunks: Buffer[] = []
    zip.outputStream.on("data", (chunk: Buffer) => chunks.push(chunk))
    zip.outputStream.on("end", () => resolve(Buffer.concat(chunks)))
    zip.outputStream.on("error", reject)
  })
}

const photo = () =>
  sharp({
    create: { width: 900, height: 600, channels: 3, background: "#c63" },
  })
    .webp()
    .toBuffer()

/** A Mealie 2.x database, as its backups have it. */
function database(extra: { recipes?: object[]; groups?: object[] } = {}) {
  return {
    alembic_version: [{ version_num: "7cf3054cbbcc" }],
    groups: extra.groups ?? [{ id: GROUP, name: "Home", slug: "home" }],
    users: [
      {
        id: KYLE,
        email: "kyle@example.com",
        full_name: "Kyle",
        group_id: GROUP,
      },
      { id: SOMEONE, email: "someone@elsewhere.com", group_id: GROUP },
    ],
    recipes: [
      {
        id: SOUP,
        group_id: GROUP,
        user_id: KYLE,
        name: "Tomato Soup",
        slug: "tomato-soup",
        description: "Warming.",
        image: "aBc1",
        recipe_yield: "",
        recipe_yield_quantity: 0,
        recipe_servings: 4,
        prep_time: "10 minutes",
        perform_time: "30 minutes",
        total_time: "40 minutes",
        org_url: "https://example.com/soup",
        rating: 4,
        last_made: "2024-01-01T12:00:00",
        date_added: "2023-06-01",
        created_at: "2023-06-01T09:30:00.123456",
        update_at: "2024-01-02T09:30:00",
      },
      {
        id: BREAD,
        group_id: GROUP,
        user_id: SOMEONE,
        name: "Soda Bread",
        slug: "soda-bread",
        image: null,
        recipe_yield: "1 loaf",
        prep_time: null,
        perform_time: "45 min",
        rating: null,
        created_at: "2023-07-01T09:30:00",
      },
      ...(extra.recipes ?? []),
    ],
    ingredient_units: [
      {
        id: "u1",
        name: "tablespoon",
        abbreviation: "tbsp",
        use_abbreviation: true,
      },
    ],
    ingredient_foods: [{ id: "f1", name: "butter" }],
    recipes_ingredients: [
      // Out of order, as rows can be.
      {
        id: 3,
        recipe_id: SOUP,
        position: 2,
        note: "2 cans tomatoes",
        quantity: 1,
      },
      {
        id: 1,
        recipe_id: SOUP,
        position: 0,
        title: "Base",
        quantity: 2,
        unit_id: "u1",
        food_id: "f1",
      },
      {
        id: 2,
        recipe_id: SOUP,
        position: 1,
        note: "1 onion, chopped",
        quantity: 1,
      },
      { id: 4, recipe_id: BREAD, position: 0, note: "500 g flour" },
    ],
    recipe_instructions: [
      { id: "s2", recipe_id: SOUP, position: 1, text: "Add the tomatoes." },
      {
        id: "s1",
        recipe_id: SOUP,
        position: 0,
        title: "Cook",
        text: "Melt the butter.",
      },
      { id: "s3", recipe_id: BREAD, position: 0, text: "Mix and bake." },
    ],
    notes: [{ id: 1, recipe_id: SOUP, title: "", text: "Freezes well." }],
    recipe_nutrition: [
      { id: 1, recipe_id: SOUP, calories: "180", protein_content: "4 g" },
    ],
    tags: [{ id: "t1", name: "Soup", group_id: GROUP }],
    recipes_to_tags: [{ recipe_id: SOUP, tag_id: "t1" }],
    categories: [{ id: "c1", name: "Dinner", group_id: GROUP }],
    recipes_to_categories: [{ recipe_id: SOUP, category_id: "c1" }],
    recipe_settings: [{ id: 1, recipe_id: SOUP, disable_amount: false }],
    households_to_recipes: [
      {
        id: 1,
        recipe_id: SOUP,
        household_id: "h1",
        last_made: "2024-03-01T12:00:00",
      },
    ],
    recipe_timeline_events: [
      {
        id: "e1",
        recipe_id: SOUP,
        user_id: KYLE,
        subject: "Kyle made this",
        message: "Needed more salt.",
        event_type: "comment",
        timestamp: "2024-03-01T12:00:00",
      },
      {
        id: "e2",
        recipe_id: SOUP,
        user_id: KYLE,
        subject: "recipe.recipe-created",
        message: null,
        event_type: "system",
        timestamp: "2023-06-01T09:30:00",
      },
    ],
    recipe_comments: [
      {
        id: "m1",
        recipe_id: SOUP,
        user_id: SOMEONE,
        text: "Lovely.",
        created_at: "2024-02-01T08:00:00",
      },
    ],
  }
}

async function backup(extra?: Parameters<typeof database>[0]) {
  return zipOf({
    "database.json": JSON.stringify(database(extra)),
    [`data/recipes/${SOUP_FOLDER}/images/original.webp`]: await photo(),
    "data/.secret": "not for Merran",
  })
}

const check = (client: TestClient, zip: Uint8Array) =>
  client.upload(
    "/api/households/current/import/files",
    zip,
    "application/zip",
    "POST"
  )

async function importFile(
  client: TestClient,
  zip: Uint8Array,
  body: object = {}
) {
  const checked = await check(client, zip)
  expect(checked.status).toBe(200)
  const file = await checked.json()
  const started = await client.post(
    `/api/households/current/import/files/${file.id}/start`,
    body
  )
  expect(started.status).toBe(202)
  await jobs.drain()
  const job = await (
    await client.get(
      `/api/households/current/jobs/${(await started.json()).id}`
    )
  ).json()
  return { file, job }
}

beforeAll(async () => {
  const test = await createTestApp()
  ;({ close, jobs } = test)
  kyle = await setUpServer(test.app, test.setupCode)
  jamie = await join(
    test.app,
    await inviteToken(kyle),
    account("jamie", "Jamie")
  )
})

afterAll(() => close())

describe("a Mealie backup", () => {
  test("is checked before it's imported", async () => {
    const res = await check(kyle, await backup())
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      app: "mealie",
      what: "backup",
      recipes: 2,
      alreadyHere: 0,
      groups: [],
    })
  })

  test("comes in with photos, notes and who wrote them", async () => {
    const { job } = await importFile(kyle, await backup())
    expect(job).toMatchObject({
      kind: "recipes.importFromApp",
      status: "done",
      result: { recipes: 2, photos: 1, skipped: 0, failed: 0 },
    })

    const soup = await (await kyle.get("/api/recipes/tomato-soup")).json()
    expect(soup).toMatchObject({
      name: "Tomato Soup",
      origin: "mealie",
      description: "Warming.",
      servings: 4,
      prepMinutes: 10,
      cookMinutes: 30,
      totalMinutes: 40,
      sourceUrl: "https://example.com/soup",
      rating: 4,
      notes: "Freezes well.",
      tags: ["Dinner", "Soup"],
      // The latest of the households' and the recipe's own.
      lastMadeAt: "2024-03-01T12:00:00.000Z",
      createdAt: "2023-06-01T09:30:00.123Z",
    })
    expect(soup.photo).not.toBeNull()
    expect(
      soup.ingredients.map((line: { section: string | null; text: string }) => [
        line.section,
        line.text,
      ])
    ).toEqual([
      ["Base", "2 tbsp butter"],
      ["Base", "1 onion, chopped"],
      ["Base", "2 cans tomatoes"],
    ])
    expect(
      soup.steps.map((step: { section: string | null; text: string }) => [
        step.section,
        step.text,
      ])
    ).toEqual([
      ["Cook", "Melt the butter."],
      ["Cook", "Add the tomatoes."],
    ])

    // "Made it" with a comment, and comments: Kyle is here, someone isn't.
    const notes = await (
      await kyle.get("/api/recipes/tomato-soup/cook-notes")
    ).json()
    expect(notes).toMatchObject([
      {
        note: "Needed more salt.",
        by: "Kyle",
        createdAt: "2024-03-01T12:00:00.000Z",
      },
      { note: "Lovely.", by: null },
    ])

    const bread = await (await kyle.get("/api/recipes/soda-bread")).json()
    expect(bread).toMatchObject({
      servings: 1,
      yieldText: "1 loaf",
      cookMinutes: 45,
      photo: null,
      ingredients: [{ text: "500 g flour" }],
    })
  })

  test("imported again, brings in only what's new", async () => {
    const extra = {
      recipes: [
        {
          id: "b45c1294d8a84f91a09114854680dc70",
          group_id: GROUP,
          name: "Flatbread",
          created_at: "2024-01-01T00:00:00",
        },
      ],
    }
    const { file, job } = await importFile(kyle, await backup(extra))
    expect(file).toMatchObject({ recipes: 3, alreadyHere: 2 })
    expect(job.result).toMatchObject({ recipes: 1, skipped: 2, failed: 0 })
  })

  test("with more than one group, imports the one chosen", async () => {
    const groups = [
      { id: GROUP, name: "Home", slug: "home" },
      { id: OTHER_GROUP, name: "Cabin", slug: "cabin" },
    ]
    const recipes = [
      {
        id: "c45c1294d8a84f91a09114854680dc71",
        group_id: OTHER_GROUP,
        name: "Campfire Beans",
        created_at: "2024-01-01T00:00:00",
      },
      {
        id: "d45c1294d8a84f91a09114854680dc72",
        group_id: OTHER_GROUP,
        name: "S'mores",
        created_at: "2024-01-01T00:00:00",
      },
    ]
    const zip = await backup({ groups, recipes })
    const checked = await (await check(kyle, zip)).json()
    expect(checked.groups).toEqual([
      { id: "0f0e0d0c-0b0a-4908-8f7e-6d5c4b3a2918", name: "Home", recipes: 2 },
      { id: "1f0e0d0c-0b0a-4908-8f7e-6d5c4b3a2918", name: "Cabin", recipes: 2 },
    ])
    const { job } = await importFile(kyle, zip, { group: OTHER_GROUP })
    expect(job.result).toMatchObject({ recipes: 2, skipped: 0 })
    expect((await kyle.get("/api/recipes/campfire-beans")).status).toBe(200)
  })
})

describe("recipes exported from Mealie", () => {
  test("come in, skipping any already in from the backup", async () => {
    const soup = {
      id: "945c1294-d8a8-4f91-a091-14854680dc6e",
      name: "Tomato Soup",
      slug: "tomato-soup",
      recipe_ingredient: [{ note: "1 onion" }],
    }
    const chowder = {
      id: "e45c1294-d8a8-4f91-a091-14854680dc73",
      name: "Corn Chowder",
      slug: "corn-chowder",
      org_url: "https://example.com/chowder",
      perform_time: "25 minutes",
      recipe_category: [{ name: "Soup" }],
      recipe_ingredient: [
        {
          quantity: 3,
          unit: { name: "cup", plural_name: "cups" },
          food: { name: "corn" },
          note: "",
        },
      ],
      recipe_instructions: [{ title: "", text: "Simmer." }],
      comments: [{ text: "A keeper.", created_at: "2024-04-01T10:00:00Z" }],
    }
    const zip = await zipOf({
      "recipes/tomato-soup/tomato-soup.json": JSON.stringify(soup),
      "recipes/corn-chowder/corn-chowder.json": JSON.stringify(chowder),
      "recipes/corn-chowder/images/original.webp": await photo(),
    })
    const { file, job } = await importFile(kyle, zip)
    expect(file).toMatchObject({ what: "recipes", recipes: 2, alreadyHere: 1 })
    expect(job.result).toMatchObject({ recipes: 1, photos: 1, skipped: 1 })

    const imported = await (await kyle.get("/api/recipes/corn-chowder")).json()
    expect(imported).toMatchObject({
      sourceUrl: "https://example.com/chowder",
      cookMinutes: 25,
      tags: ["Soup"],
      ingredients: [{ text: "3 cups corn" }],
      steps: [{ text: "Simmer." }],
    })
    expect(imported.photo).not.toBeNull()
    expect(
      await (await kyle.get("/api/recipes/corn-chowder/cook-notes")).json()
    ).toMatchObject([{ note: "A keeper.", by: null }])
  })

  test("one recipe's own export comes in too", async () => {
    const zip = await zipOf({
      "pancakes.json": JSON.stringify({
        id: "f45c1294-d8a8-4f91-a091-14854680dc74",
        name: "Pancakes",
        recipe_ingredient: [{ note: "2 eggs" }],
      }),
      "original.webp": await photo(),
    })
    const { job } = await importFile(kyle, zip)
    expect(job.result).toMatchObject({ recipes: 1, photos: 1 })
  })
})

describe("files Merran can't import", () => {
  test("are turned away when checked", async () => {
    for (const zip of [
      await zipOf({ "notes.txt": "hello" }),
      await zipOf({ "database.json": "{ broken" }),
      new TextEncoder().encode("not a zip"),
    ]) {
      const res = await check(kyle, zip)
      expect(res.status).toBe(400)
      expect((await res.json()).error.code).toBe("not_an_import")
    }
  })

  test("can only be started by the household that sent them", async () => {
    const res = await kyle.post(
      "/api/households/current/import/files/0d0a3d6e-6f8b-4bd2-9a3f-0c4b2d1e5f60/start",
      {}
    )
    expect(res.status).toBe(404)
    expect((await check(jamie, await backup())).status).toBe(403)
  })
})
