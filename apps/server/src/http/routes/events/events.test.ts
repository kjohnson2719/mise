import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../app.ts"
import type { EventBus } from "../../../services/events/events.ts"
import {
  account,
  createTestApp,
  inviteToken,
  join,
  setUpServer,
  TEST_ORIGIN,
  TestClient,
} from "../../../test/app.ts"

// Live updates: what changes in a household, as it happens, to its open
// pages and other devices.

let app: App
let events: EventBus
let close: () => Promise<void>
let kyle: TestClient
let jamie: TestClient
let sam: TestClient
let home: string

type Event = { event: string; data: unknown }

/**
 * Listens to /api/events as a client (or an API key): `next()` is the next
 * event that isn't a ping, `close()` hangs up.
 */
async function listen(
  as: TestClient | { key: string },
  query: Record<string, string> = {}
) {
  const controller = new AbortController()
  const headers =
    as instanceof TestClient
      ? as.headers()
      : new Headers({ authorization: `Bearer ${as.key}` })
  const res = await app.request(
    `${TEST_ORIGIN}/api/events?${new URLSearchParams(query)}`,
    { headers, signal: controller.signal }
  )
  // A stream's body never ends, so it's only read when something's wrong.
  if (res.status !== 200) expect(await res.text()).toBe("a stream")
  expect(res.headers.get("content-type")).toContain("text/event-stream")
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  async function read(): Promise<Event> {
    for (;;) {
      const end = buffer.indexOf("\n\n")
      if (end !== -1) {
        const frame = buffer.slice(0, end)
        buffer = buffer.slice(end + 2)
        const lines = frame.split("\n")
        const event =
          lines
            .find((line) => line.startsWith("event:"))
            ?.slice(6)
            .trim() ?? "message"
        const data = lines
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .join("\n")
        if (event === "ping") continue
        return { event, data: data ? JSON.parse(data) : null }
      }
      const { value, done } = await reader.read()
      if (done) throw new Error("The stream ended.")
      buffer += decoder.decode(value, { stream: true })
    }
  }

  const stream = {
    /** The next event, or a failure after a second with none. */
    next: (wait = 1_000) =>
      Promise.race([
        read(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("No event came.")), wait)
        ),
      ]),
    // As a browser hangs up: the server sees its answer cancelled.
    close: () => {
      void reader.cancel()
      controller.abort()
    },
  }
  expect(await stream.next()).toMatchObject({ event: "ready" })
  return stream
}

/** Waits until the bus has this many listeners, as hanging up is async. */
async function listeners(count: number) {
  for (let i = 0; i < 50 && events.size !== count; i++)
    await new Promise((resolve) => setTimeout(resolve, 10))
  expect(events.size).toBe(count)
}

const typeItem = (who: TestClient, text: string) =>
  who.post("/api/list/items", { text })

beforeAll(async () => {
  const test = await createTestApp()
  ;({ app, events, close } = test)
  kyle = await setUpServer(app, test.setupCode)
  home = (await (await kyle.get("/api/households/current")).json()).id
  jamie = await join(app, await inviteToken(kyle), account("jamie", "Jamie"))
  // Sam is in another household, the Cabin.
  await kyle.post("/api/households", { name: "Cabin" })
  sam = await join(app, await inviteToken(kyle), account("sam", "Sam"))
  await kyle.post("/api/auth/organization/set-active", {
    organizationId: home,
  })
})

afterAll(() => close())

describe("live updates", () => {
  test("tell the household's other people and devices what changed, and who did it", async () => {
    kyle.client = "kyle-phone"
    const phone = await listen(kyle, { client: "kyle-phone" })
    const laptop = await listen(kyle, { client: "kyle-laptop" })
    const others = await listen(jamie, { client: "jamie-phone" })

    await typeItem(kyle, "milk")
    const change = {
      event: "list",
      data: { area: "list", by: { name: "Kyle" } },
    }
    expect(await laptop.next()).toMatchObject(change)
    expect(await others.next()).toMatchObject(change)
    // The phone made the change, so it knows: its next event is Jamie's.
    jamie.client = "jamie-phone"
    await typeItem(jamie, "bread")
    expect(await phone.next()).toMatchObject({
      event: "list",
      data: { by: { name: "Jamie" } },
    })

    for (const stream of [phone, laptop, others]) stream.close()
    kyle.client = null
    jamie.client = null
    await listeners(0)
  })

  test("are only the household's own", async () => {
    const cabin = await listen(sam)
    await typeItem(kyle, "eggs")
    await typeItem(sam, "firewood")
    // Sam hears about the Cabin's list, not Kyle's.
    expect(await cabin.next()).toMatchObject({
      event: "list",
      data: { by: { name: "Sam" } },
    })
    cabin.close()
    await listeners(0)
  })

  test("say what changed: the plan changes the list too, and reads change nothing", async () => {
    const stream = await listen(jamie)
    await kyle.get("/api/list")
    await kyle.post("/api/list/items", { text: "" })
    await kyle.post("/api/plan/suggest", {
      slots: [{ date: "2026-10-15", meal: "dinner" }],
    })
    await kyle.post("/api/plan/entries", {
      date: "2026-10-15",
      meal: "dinner",
      note: "Leftovers",
    })
    expect(await stream.next()).toMatchObject({ event: "plan" })
    expect(await stream.next()).toMatchObject({ event: "list" })
    stream.close()
    await listeners(0)
  })

  test("say who has a page open", async () => {
    const kyleOnList = await listen(kyle, { page: "list" })
    expect(await kyleOnList.next()).toMatchObject({
      event: "presence",
      data: { page: "list", people: [{ name: "Kyle" }] },
    })
    const jamieOnList = await listen(jamie, { page: "list" })
    const both = {
      event: "presence",
      data: { people: [{ name: "Kyle" }, { name: "Jamie" }] },
    }
    expect(await jamieOnList.next()).toMatchObject(both)
    expect(await kyleOnList.next()).toMatchObject(both)
    // Kyle on another device is still one Kyle.
    const kyleAgain = await listen(kyle, { page: "list" })
    expect(await kyleAgain.next()).toMatchObject(both)
    kyleAgain.close()

    jamieOnList.close()
    // Hanging up says so straight away; Kyle's other device changed nothing.
    expect(await kyleOnList.next()).toMatchObject({
      event: "presence",
      data: { people: [{ name: "Kyle" }] },
    })
    kyleOnList.close()
    await listeners(0)
  })

  test("are open to API keys, about what they can read", async () => {
    const key = (
      await (
        await kyle.post("/api/auth/api-keys", {
          name: "Home Assistant",
          permissions: { list: "read" },
          expiresInDays: 30,
        })
      ).json()
    ).key
    const stream = await listen({ key }, { page: "list" })
    await kyle.post("/api/plan/entries", {
      date: "2026-10-16",
      meal: "dinner",
      note: "Takeaway",
    })
    // Not the plan, which it can't read, and no one on the page.
    expect(await stream.next()).toMatchObject({
      event: "list",
      data: { by: { name: "Kyle" } },
    })
    stream.close()
    await listeners(0)
  })

  test("end when the server stops", async () => {
    const stream = await listen(kyle)
    await listeners(1)
    events.closeAll()
    await listeners(0)
    await expect(stream.next()).rejects.toThrow()
  })
})
