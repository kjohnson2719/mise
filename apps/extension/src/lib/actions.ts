import {
  apiFor,
  getConnection,
  MerranError,
  unwrap,
  type Connection,
  type Schemas,
} from "./merran"
import { readPage, type PageRead } from "./page"

// What the popup and the right-click menu do, in one place.

export type ImportResult = Schemas["ImportResult"]

/** How adding a tab's recipe went, as the background tells the popup. */
export type Added =
  { ok: true; message: string; link: string } | { ok: false; message: string }

const VIDEO_HOSTS =
  /(^|\.)(tiktok\.com|youtube\.com|youtu\.be|instagram\.com|instagr\.am|facebook\.com|fb\.watch)$/i

/** A video's page, which Merran watches for its recipe: a minute or two. */
export function isVideoPage(url: string) {
  try {
    return VIDEO_HOSTS.test(new URL(url).hostname)
  } catch {
    return false
  }
}

async function connected() {
  const connection = await getConnection()
  if (!connection) {
    throw new MerranError(
      0,
      "not_connected",
      "Connect the extension to your Merran first: click its button in the toolbar."
    )
  }
  return connection
}

/** Reads the page open in a tab, as the browser shows it. */
export async function readTab(tabId: number): Promise<PageRead> {
  const [read] = await browser.scripting.executeScript({
    target: { tabId },
    func: readPage,
  })
  if (!read?.result) {
    throw new MerranError(0, "unreadable", "This page can't be read.")
  }
  return read.result
}

/** Imports a page already read, through the person's own browser. */
export async function importRead(page: PageRead) {
  const connection = await connected()
  const result = await unwrap(
    apiFor(connection).POST("/api/recipes/import/page", {
      body: {
        url: page.url,
        title: page.title,
        jsonld: page.jsonld,
        images: page.images,
        text: page.text,
      },
    }),
    connection.origin
  )
  return { result, link: recipeLink(connection, result.recipe.slug) }
}

/** Imports a link, which Merran's server opens itself. */
export async function importLink(url: string) {
  const connection = await connected()
  const result = await unwrap(
    apiFor(connection).POST("/api/recipes/import", { body: { url } }),
    connection.origin
  )
  return { result, link: recipeLink(connection, result.recipe.slug) }
}

/** Adds things to the shopping list, one for each line or comma. */
export async function addToList(selection: string) {
  const connection = await connected()
  const lines = selection
    .split(/\n|,(?![^(]*\))/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 30)
  const api = apiFor(connection)
  for (const text of lines) {
    await unwrap(
      api.POST("/api/list/items", { body: { text: text.slice(0, 200) } }),
      connection.origin
    )
  }
  return lines
}

export function recipeLink(connection: Connection, slug: string) {
  return `${connection.origin}/recipes/${slug}`
}

/** What an import says: added, or there already. */
export function importedMessage(result: ImportResult) {
  return result.duplicate
    ? `${result.recipe.name} is in your recipes already.`
    : `Added ${result.recipe.name} to your recipes.`
}

/**
 * Opens the shopping list beside the page: Chrome and Edge's side panel,
 * or Firefox's sidebar. Only from a click, as browsers ask.
 */
export async function openListPanel(windowId?: number) {
  const firefox = browser as unknown as {
    sidebarAction?: { open(): Promise<void> }
  }
  if (firefox.sidebarAction) return firefox.sidebarAction.open()
  const chrome = browser as unknown as {
    sidePanel?: { open(options: { windowId: number }): Promise<void> }
  }
  if (chrome.sidePanel && windowId !== undefined) {
    return chrome.sidePanel.open({ windowId })
  }
}
