import {
  isWalmartCheck,
  walmartProductPage,
  walmartProductUrl,
  walmartSearchResults,
  walmartSearchUrl,
  WALMART_ORIGIN,
  type ExtensionCalls,
  type ExtensionCommand,
  type ExtensionNo,
  type ExtensionStatus,
  type WalmartJob,
  type WalmartPage,
  type WalmartSkip,
} from "@merran/shared"

import {
  apiFor,
  getConnections,
  MerranError,
  unwrap,
  type Connection,
  type Schemas,
} from "./merran"
import { addToCartOnPage, readWalmartPage } from "./walmart-page"

// Walmart, in the person's own Walmart tab (docs/platform.md, Stores): the
// extension finds things and fills the cart there when Merran's page asks,
// one page at a time, and hands Merran what it read. The tab comes to the
// front while a job runs, so the person sees it work, and so the browser
// doesn't slow it down as it does tabs in the background; Merran's tab
// comes back once it's done. It never gets past Walmart's check that it's
// a person: it stops, the person finishes the check in the tab, and it
// carries on by itself once they're through. A job is kept in storage, so
// the page can follow it, and so it can carry on where it stopped.

/** A product as Merran takes it from the extension: always in dollars. */
type Product = Schemas["WalmartProduct"]

/** Being allowed on walmart.com, which the person grants once. */
export const WALMART_ACCESS = { origins: [`${WALMART_ORIGIN}/*`] }

/** Walmart answers quick bursts with errors; a steady pace is fine. */
const PAUSE_MS = 1000

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type Find = { itemId: string; words: string }
type Fill = {
  productId: string
  url: string
  name: string
  packages: number
  lines: { itemId: string; packages: number }[]
}

/** A job as the extension keeps it: what the page sees, and what's left. */
type Job = WalmartJob & {
  origin: string
  /** Where the Merran tab that asked is, to open Walmart beside it. */
  beside: Beside | null
  /** That tab, to go back to when it's done. */
  merranTab: number | null
} & ({ kind: "find"; todo: Find[] } | { kind: "fill"; todo: Fill[] })

type Beside = { windowId: number; index: number }

/**
 * The job running now, in this run of the background: Stop stops this
 * one, which the job itself checks between things.
 */
let active: Job | null = null

/** Whether the Walmart tab is taken, by a job or a search, in this run. */
let running = false

async function loadJob(): Promise<Job | null> {
  if (active) return active
  const { walmartJob } = await browser.storage.local.get("walmartJob")
  const job = (walmartJob as Job | undefined) ?? null
  // Marked running, but not running here: the browser stopped the
  // extension part way.
  if (job?.state === "running") {
    return { ...job, state: "stopped", now: null, stopping: false }
  }
  return job
}

async function save(job: Job) {
  job.at = new Date().toISOString()
  await browser.storage.local.set({ walmartJob: job })
  await badge(job)
}

/**
 * The toolbar button says how it's going, whichever tab the person's on:
 * how many are left, or "!" when Walmart wants to check they're a person.
 */
async function badge(job: Job | null) {
  const text =
    job?.state === "running"
      ? String(Math.max(0, job.total - job.done))
      : job?.state === "check"
        ? "!"
        : ""
  try {
    await browser.action.setBadgeText({ text })
    if (text) {
      await browser.action.setBadgeBackgroundColor({
        color: job?.state === "check" ? "#b45309" : "#356844",
      })
    }
  } catch {
    // No toolbar button to badge: nothing to do.
  }
}

/** Something the page shows changed, besides the job and connections. */
const changed = () => browser.storage.local.set({ bridgeChanged: Date.now() })

/** The job as a page sees it. */
function shown(job: Job): WalmartJob {
  const { origin, beside, merranTab, todo, ...seen } = job
  return seen
}

/** The person closed the Walmart tab part way. */
class TabClosed extends Error {}

/** The Walmart tab the extension works in, if it's still open on Walmart. */
async function openTab() {
  const { walmartTab } = await browser.storage.session.get("walmartTab")
  if (typeof walmartTab !== "number") return null
  try {
    const tab = await browser.tabs.get(walmartTab)
    return tab.url?.startsWith(WALMART_ORIGIN) ? walmartTab : null
  } catch {
    return null
  }
}

/** Whether the next page the Walmart tab opens comes to the front. */
let forward = false

/**
 * Opens a page in the Walmart tab, or a new Walmart tab beside Merran's:
 * in front at the start of a job, and left where the person put it after.
 */
async function goTo(url: string, beside: Beside | null) {
  const front = forward
  forward = false
  const tabId = await openTab()
  if (tabId !== null) {
    try {
      const tab = await browser.tabs.update(tabId, {
        url,
        ...(front ? { active: true } : {}),
      })
      if (front && tab?.windowId !== undefined) {
        await browser.windows.update(tab.windowId, { focused: true })
      }
      return tabId
    } catch {
      // Closed just now: open another.
    }
  }
  const tab = await browser.tabs.create({
    url,
    active: front,
    ...(beside ? { windowId: beside.windowId, index: beside.index + 1 } : {}),
  })
  await browser.storage.session.set({ walmartTab: tab.id })
  await changed()
  return tab.id!
}

/** What's on the page in the Walmart tab, or null if it can't be read now. */
async function tryRead(tabId: number): Promise<WalmartPage | null> {
  try {
    const [result] = await browser.scripting.executeScript({
      target: { tabId },
      func: readWalmartPage,
    })
    return (result?.result as WalmartPage | undefined) ?? null
  } catch {
    // Caught part way through moving to the next page.
    await tabStillThere(tabId)
    return null
  }
}

async function readTab(tabId: number): Promise<WalmartPage> {
  for (let tries = 0; tries < 3; tries++) {
    const page = await tryRead(tabId)
    if (page) return page
    await sleep(500)
  }
  throw new Error("Couldn't read Walmart's page.")
}

async function tabStillThere(tabId: number) {
  try {
    await browser.tabs.get(tabId)
  } catch {
    throw new TabClosed("The Walmart tab was closed.")
  }
}

/**
 * Goes to a Walmart page in the Walmart tab and reads it as soon as it's
 * there: once its page is in, not once everything it loads after (ads and
 * the like) is. Only the page it was sent to counts, as the page itself
 * says, or Walmart asking whether it's a person, which can be anywhere;
 * or, once a page finishes, wherever Walmart sent it instead.
 */
async function visit(
  url: string,
  arrived: (url: string) => boolean,
  beside: Beside | null
): Promise<{ tabId: number; page: WalmartPage }> {
  const moves = new Map<number, { complete: boolean }[]>()
  let wake = () => {}
  const moved = (id: number, change: { status?: string; url?: string }) => {
    if (!change.status && !change.url) return
    moves.set(id, [
      ...(moves.get(id) ?? []),
      { complete: change.status === "complete" },
    ])
    wake()
  }
  browser.tabs.onUpdated.addListener(moved)
  try {
    const was = await openTab()
    const before = was === null ? null : (await browser.tabs.get(was)).url
    const tabId = await goTo(url, beside)
    const end = Date.now() + 25_000
    while (Date.now() < end) {
      const seen = moves.get(tabId) ?? []
      moves.set(tabId, [])
      if (seen.length > 0) {
        const page = await tryRead(tabId)
        if (page && (arrived(page.url) || isWalmartCheck(page))) {
          return { tabId, page }
        }
        // Finished somewhere else: Walmart sent it on.
        if (
          page &&
          seen.some((one) => one.complete) &&
          page.url !== before &&
          page.url.startsWith(WALMART_ORIGIN)
        ) {
          return { tabId, page }
        }
      }
      await new Promise<void>((resolve) => {
        wake = resolve
        setTimeout(resolve, 750)
      })
      await tabStillThere(tabId)
    }
    const page = await readTab(tabId)
    if (isWalmartCheck(page)) return { tabId, page }
    throw new Error("Walmart took too long to load.")
  } finally {
    browser.tabs.onUpdated.removeListener(moved)
  }
}

/** Whether an address is Walmart's search for these words. */
function isSearchFor(url: string, words: string) {
  const same = (text: string) => text.trim().replace(/\s+/g, " ").toLowerCase()
  try {
    const at = new URL(url)
    return (
      at.pathname.startsWith("/search") &&
      same(at.searchParams.get("q") ?? "") === same(words)
    )
  } catch {
    return false
  }
}

/** Searches Walmart in the Walmart tab; null when Walmart asks if it's a person. */
async function search(
  words: string,
  beside: Beside | null
): Promise<Product[] | null> {
  let { tabId, page } = await visit(
    walmartSearchUrl(words),
    (url) => isSearchFor(url, words),
    beside
  )
  // The results can come a moment after the page.
  for (let tries = 0; tries < 6; tries++) {
    if (isWalmartCheck(page)) return null
    const products = walmartSearchResults(page.data)
    if (products) return products as Product[]
    await sleep(500)
    page = await readTab(tabId)
  }
  return []
}

/** The connection to a household on the Merran a page is on. */
async function connectionFor(origin: string, householdId: string) {
  const { all } = await getConnections()
  return (
    all.find(
      (one) => one.origin === origin && one.householdId === householdId
    ) ?? null
  )
}

/** Finds each thing still to find, and hands Merran what Walmart has. */
async function runFind(job: Job & { kind: "find" }, connection: Connection) {
  const api = apiFor(connection)
  while (job.todo.length > 0) {
    if (job.stopping) {
      job.state = "stopped"
      return
    }
    const next = job.todo[0]!
    job.now = next.words
    await save(job)
    const products = await search(next.words, job.beside)
    if (products === null) {
      job.state = "check"
      return
    }
    if (products.length > 0) {
      await unwrap(
        api.POST("/api/stores/walmart/found", {
          body: { items: [{ itemId: next.itemId, products }] },
        }),
        connection.origin
      )
    } else {
      job.skipped.push({ name: next.words, why: "not_found" })
    }
    job.todo.shift()
    job.done++
    await save(job)
    if (job.todo.length > 0 && !job.stopping) await sleep(PAUSE_MS)
  }
  job.state = "done"
}

/** Adds each product to the cart from its page, one at a time. */
async function runFill(job: Job & { kind: "fill" }, connection: Connection) {
  const api = apiFor(connection)
  while (job.todo.length > 0) {
    if (job.stopping) {
      job.state = "stopped"
      return
    }
    const next = job.todo[0]!
    job.now = next.name
    await save(job)
    const added = await addOne(next, job.beside)
    if (added === "check") {
      job.state = "check"
      return
    }
    if (typeof added === "string") {
      job.skipped.push({ name: next.name, why: added })
    } else {
      // Remembered at once, so carrying on later skips it.
      await unwrap(
        api.POST("/api/stores/walmart/sent", {
          body: {
            lines: next.lines.map((line) => ({
              ...line,
              ...(added.product ? { product: added.product } : {}),
            })),
          },
        }),
        connection.origin
      )
      job.added.push({ name: next.name, packages: added.quantity })
    }
    job.todo.shift()
    job.done++
    await save(job)
    if (job.todo.length > 0 && !job.stopping) await sleep(PAUSE_MS)
  }
  job.state = "done"
}

/** Adds one product from its page: how many the cart has, or why not. */
async function addOne(
  fill: Fill,
  beside: Beside | null
): Promise<
  { quantity: number; product: Product | null } | WalmartSkip | "check"
> {
  // Walmart sometimes moves on to another page part way; then open the
  // product again and carry on from what's in the cart.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { tabId, page } = await visit(
      fill.url,
      (url) => url.includes(fill.productId),
      beside
    )
    if (isWalmartCheck(page)) return "check"
    const product = walmartProductPage(page.data)
    if (product?.id === fill.productId && !product.inStock) {
      return "out_of_stock"
    }
    try {
      const [result] = await browser.scripting.executeScript({
        target: { tabId },
        func: addToCartOnPage,
        args: [fill.packages],
      })
      const added = result?.result
      if (!added) continue
      if (added.check) return "check"
      if (!added.ok) return added.why ?? "not_added"
      return {
        quantity: added.quantity,
        product: product?.id === fill.productId ? (product as Product) : null,
      }
    } catch {
      await tabStillThere(tabId)
      await sleep(PAUSE_MS)
    }
  }
  return "not_added"
}

/**
 * Goes back to the Merran tab that asked, once a job's done: only if the
 * person's still watching Walmart, never from another tab they went to.
 */
async function backToMerran(job: Job) {
  if (job.merranTab === null) return
  try {
    const walmart = await openTab()
    if (walmart === null || !(await browser.tabs.get(walmart)).active) return
    const tab = await browser.tabs.update(job.merranTab, { active: true })
    if (tab?.windowId !== undefined) {
      await browser.windows.update(tab.windowId, { focused: true })
    }
  } catch {
    // Merran's tab was closed: stay on Walmart.
  }
}

/** Starts a job, the Walmart tab claimed already, in front if `front`. */
async function start(job: Job, connection: Connection, front: boolean) {
  active = job
  forward = front
  await save(job)
  void run(job, connection)
}

/** Runs a job until it's done, stopped, or stopped at Walmart's check. */
async function run(job: Job, connection: Connection) {
  try {
    if (job.kind === "find") await runFind(job, connection)
    else await runFill(job, connection)
  } catch (error) {
    if (error instanceof TabClosed) {
      job.state = "stopped"
    } else {
      job.state = "failed"
      job.error = (error as Error).message
    }
  } finally {
    job.now = null
    job.stopping = false
    await save(job)
    active = null
    running = false
    if (job.state === "done") await backToMerran(job)
  }
}

/** What the extension says about itself to a page on a Merran. */
export async function statusFor(origin: string): Promise<ExtensionStatus> {
  const { all } = await getConnections()
  const job = await loadJob()
  return {
    version: browser.runtime.getManifest().version,
    households: all
      .filter((one) => one.origin === origin)
      .map((one) => ({ id: one.householdId, name: one.household })),
    walmart: {
      access: await browser.permissions.contains(WALMART_ACCESS),
      tab: (await openTab()) !== null,
    },
    job: job?.origin === origin ? shown(job) : null,
  }
}

type Answer = { ok: true } | { ok: false; why: ExtensionNo; message?: string }
const no = (why: ExtensionNo, message?: string): Answer => ({
  ok: false,
  why,
  ...(message ? { message } : {}),
})

/**
 * Takes the Walmart tab for a job or a search, or says why not. Taken at
 * once, before anything's awaited, so two clicks can't both start one;
 * whoever took it gives it back when it's done, or failed to start.
 */
async function claim(): Promise<Answer | null> {
  if (running) return no("busy")
  running = true
  if (!(await browser.permissions.contains(WALMART_ACCESS))) {
    running = false
    return no("access")
  }
  return null
}

/** Merran's answer, as the page shows it. */
const failed = (error: unknown) =>
  no(
    "failed",
    error instanceof MerranError ? error.message : (error as Error).message
  )

/** A new job, running. */
function newJob(
  origin: string,
  householdId: string,
  beside: Beside | null,
  merranTab: number | null,
  work: { kind: "find"; todo: Find[] } | { kind: "fill"; todo: Fill[] }
): Job {
  return {
    ...work,
    origin,
    householdId,
    beside,
    merranTab,
    stopping: false,
    state: "running",
    now: null,
    done: 0,
    total: work.todo.length,
    added: [],
    skipped: [],
    error: null,
    at: new Date().toISOString(),
  }
}

/**
 * Carries on with a job stopped part way or at Walmart's check: from a
 * Merran page that asked (`from`), with Walmart in front, or by itself
 * once the person's through the check in the Walmart tab.
 */
async function resume(
  job: Job,
  from: { beside: Beside | null; merranTab: number | null } | null
): Promise<Answer> {
  const connection = await connectionFor(job.origin, job.householdId)
  if (!connection) return no("household")
  const cant = await claim()
  if (cant) return cant
  Object.assign(job, { state: "running", stopping: false, error: null })
  if (from) {
    // Opened again beside the tab that asked, if it was closed.
    job.beside = from.beside ?? job.beside
    job.merranTab = from.merranTab ?? job.merranTab
  }
  await start(job, connection, from !== null)
  return { ok: true }
}

/** Fill lines grouped by product: two lines of milk are one product. */
function fillsFor(
  basket: Awaited<ReturnType<typeof basketOf>>,
  lines: readonly { itemId: string; packages: number }[]
) {
  const byItem = new Map(basket.lines.map((line) => [line.itemId, line]))
  const fills = new Map<string, Fill>()
  const skipped: WalmartJob["skipped"] = []
  for (const { itemId, packages } of lines) {
    const line = byItem.get(itemId)
    if (!line) continue
    const product = line.product
    if (!product) {
      skipped.push({ name: line.name, why: "no_product" })
      continue
    }
    const fill = fills.get(product.id) ?? {
      productId: product.id,
      url: product.url ?? walmartProductUrl(product.id),
      name: product.name,
      packages: 0,
      lines: [],
    }
    fill.packages = Math.min(99, fill.packages + packages)
    fill.lines.push({ itemId, packages })
    fills.set(product.id, fill)
  }
  return { fills: [...fills.values()], skipped }
}

const basketOf = (connection: Connection) =>
  unwrap(
    apiFor(connection).GET("/api/stores/walmart/basket"),
    connection.origin
  )

/**
 * Does what a Merran page asked, for the Merran it's on (`origin`, as the
 * browser says, never as the page says), from a tab at `beside`.
 */
export async function answerPage<C extends ExtensionCommand>(
  command: C,
  args: ExtensionCalls[C]["args"],
  origin: string,
  beside: Beside | null,
  merranTab: number | null
): Promise<unknown> {
  // Only Merrans it's connected to; any other page learns only that.
  const { all } = await getConnections()
  if (!all.some((one) => one.origin === origin)) {
    return command === "status" ? statusFor(origin) : no("household")
  }
  const { householdId, lines, words } = args as {
    householdId?: string
    lines?: { itemId: string; packages: number }[]
    words?: string
  }
  const connection =
    typeof householdId === "string"
      ? await connectionFor(origin, householdId)
      : null
  switch (command) {
    case "status":
      return statusFor(origin)

    case "walmart-access": {
      await browser.tabs.create({
        url: browser.runtime.getURL(
          `/walmart.html${merranTab === null ? "" : `?back=${merranTab}`}`
        ),
        ...(beside
          ? { windowId: beside.windowId, index: beside.index + 1 }
          : {}),
      })
      return { ok: true }
    }

    case "walmart-find": {
      if (!connection) return no("household")
      const cant = await claim()
      if (cant) return cant
      try {
        const basket = await basketOf(connection)
        const job = newJob(origin, connection.householdId, beside, merranTab, {
          kind: "find",
          todo: basket.toFind,
        })
        await start(job, connection, true)
        return { ok: true }
      } catch (error) {
        running = false
        return failed(error)
      }
    }

    case "walmart-fill": {
      if (!connection) return no("household")
      if (!Array.isArray(lines)) return no("failed")
      const cant = await claim()
      if (cant) return cant
      try {
        const { fills, skipped } = fillsFor(
          await basketOf(connection),
          lines
            .filter(
              (line) =>
                typeof line?.itemId === "string" &&
                Number.isInteger(line.packages) &&
                line.packages > 0
            )
            .slice(0, 300)
        )
        const job = newJob(origin, connection.householdId, beside, merranTab, {
          kind: "fill",
          todo: fills,
        })
        job.skipped = skipped
        await start(job, connection, true)
        return { ok: true }
      } catch (error) {
        running = false
        return failed(error)
      }
    }

    case "walmart-search": {
      if (!connection) return no("household")
      if (typeof words !== "string" || !words.trim()) return no("failed")
      const cant = await claim()
      if (cant) return cant
      try {
        const products = await search(words.trim().slice(0, 200), beside)
        return products === null ? no("check") : { ok: true, products }
      } catch (error) {
        return error instanceof TabClosed ? no("failed") : failed(error)
      } finally {
        running = false
      }
    }

    case "walmart-carry-on": {
      if (active?.origin === origin) return { ok: true }
      const job = await loadJob()
      if (!job || job.origin !== origin) return no("failed")
      if (job.state !== "check" && job.state !== "stopped") return no("failed")
      return resume(job, { beside, merranTab })
    }

    case "walmart-stop": {
      if (active?.origin === origin) {
        // The running job sees this between things, and stops.
        active.stopping = true
        await save(active)
        return { ok: true }
      }
      const job = await loadJob()
      if (job?.origin === origin) await save(job)
      return { ok: true }
    }

    case "walmart-show": {
      const tabId =
        (await openTab()) ?? (await goTo(`${WALMART_ORIGIN}/`, beside))
      const tab = await browser.tabs.update(tabId, { active: true })
      if (tab?.windowId !== undefined) {
        await browser.windows.update(tab.windowId, { focused: true })
      }
      return { ok: true }
    }

    case "walmart-dismiss": {
      if (active) return { ok: true }
      const job = await loadJob()
      if (job?.origin === origin) {
        await browser.storage.local.remove("walmartJob")
        await badge(null)
      }
      return { ok: true }
    }

    default:
      return no("failed")
  }
}

/**
 * Once the person's through Walmart's check in the Walmart tab, the job
 * that stopped there carries on by itself.
 */
async function carryOnAfterCheck(tabId: number) {
  if (running) return
  if ((await openTab()) !== tabId) return
  const job = await loadJob()
  if (job?.state !== "check") return
  const page = await tryRead(tabId)
  if (!page || isWalmartCheck(page)) return
  await resume(job, null)
}

/**
 * Tells the pages when the Walmart tab closes or access changes, and
 * carries on after Walmart's check.
 */
export function watchWalmart() {
  browser.tabs.onRemoved.addListener((tabId) => {
    void browser.storage.session.get("walmartTab").then(({ walmartTab }) => {
      if (walmartTab !== tabId) return
      void browser.storage.session.remove("walmartTab").then(changed)
    })
  })
  browser.tabs.onUpdated.addListener((tabId, change) => {
    if (change.status === "complete") {
      void carryOnAfterCheck(tabId).catch(() => {})
    }
  })
  browser.permissions.onAdded.addListener(() => void changed())
  browser.permissions.onRemoved.addListener(() => void changed())
  // A job cut off when the browser stopped the extension isn't running.
  void loadJob().then(badge)
}
