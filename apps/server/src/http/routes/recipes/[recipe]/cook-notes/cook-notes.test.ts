import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../../../app.ts"
import { CookNote } from "../../../../../database/entities/index.ts"
import type { Database } from "../../../../../database/orm.ts"
import { ACROSS_HOUSEHOLDS } from "../../../../../database/scope.ts"
import {
  account,
  createTestApp,
  inviteToken,
  join,
  setUpServer,
  TestClient,
} from "../../../../../test/app.ts"

let app: App
let close: () => Promise<void>
let database: Database
let kyle: TestClient
let jamie: TestClient

beforeAll(async () => {
  const test = await createTestApp()
  ;({ app, close, database } = test)
  kyle = await setUpServer(app, test.setupCode)
  jamie = await join(app, await inviteToken(kyle), account("jamie", "Jamie"))
  await kyle.post("/api/recipes", { name: "Soup" })
})

afterAll(() => close())

const notes = async () =>
  (await kyle.get("/api/recipes/soup/cook-notes")).json()

describe("how cooking went", () => {
  test("is kept with who said it, and the stars become the rating", async () => {
    const res = await kyle.post("/api/recipes/soup/cook-notes", {
      rating: 4,
      note: "  Needed more salt. ",
    })
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({
      rating: 4,
      note: "Needed more salt.",
      by: "Kyle",
    })

    const soup = await (await kyle.get("/api/recipes/soup")).json()
    expect(soup.rating).toBe(4)
    expect(await (await kyle.get("/api/recipes/soup/versions")).json()).toEqual(
      []
    )
  })

  test("can be just a note, which leaves the rating alone", async () => {
    await jamie.post("/api/recipes/soup/cook-notes", { note: "5 minutes less" })

    expect((await (await kyle.get("/api/recipes/soup")).json()).rating).toBe(4)
    const list = await notes()
    expect(list.map((note: { by: string }) => note.by)).toEqual([
      "Jamie",
      "Kyle",
    ])
    expect(list[0]).toMatchObject({ rating: null, note: "5 minutes less" })
  })

  test("needs stars or a note, and stars from 1 to 5", async () => {
    const add = (body: unknown) =>
      kyle.post("/api/recipes/soup/cook-notes", body)
    expect((await add({})).status).toBe(400)
    expect((await add({ note: "   " })).status).toBe(400)
    expect((await add({ rating: 6 })).status).toBe(400)
    expect(
      (await kyle.post("/api/recipes/no-such-recipe/cook-notes", { rating: 3 }))
        .status
    ).toBe(404)
  })

  test("can be deleted, keeping the rating", async () => {
    const [latest] = await notes()
    const path = `/api/recipes/soup/cook-notes/${latest.id}`
    expect((await kyle.delete(path)).status).toBe(204)
    expect((await kyle.delete(path)).status).toBe(404)
    expect(
      (await kyle.delete("/api/recipes/soup/cook-notes/not-an-id")).status
    ).toBe(404)
    expect(await notes()).toHaveLength(1)
    expect((await (await kyle.get("/api/recipes/soup")).json()).rating).toBe(4)
  })

  test("goes when the recipe is deleted for good", async () => {
    const soup = await (await kyle.get("/api/recipes/soup")).json()
    await kyle.delete("/api/recipes/soup")
    await kyle.delete(`/api/recipes/deleted/${soup.id}`)

    expect(
      await database.em
        .fork()
        .count(CookNote, { recipe: soup.id }, ACROSS_HOUSEHOLDS)
    ).toBe(0)
  })
})
