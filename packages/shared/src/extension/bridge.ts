import type { StoreProduct } from "../list/products.ts"

// How Merran's own pages talk to Merran's browser extension, when it's
// connected to that Merran: the extension listens on the page (its bridge),
// says it's there, and does what the page asks in the person's own browser,
// such as filling their Walmart cart in a tab of its own. The page never
// sees the extension's key, and the extension only listens on the Merrans
// it's connected to. Messages go both ways by window.postMessage.

/** What the page sends: `{ source: "merran", type: "extension-call", ... }`. */
export const FROM_PAGE = "merran"
/** What the extension sends: `{ source: "merran-extension", ... }`. */
export const FROM_EXTENSION = "merran-extension"

/** Why the extension left something out of the Walmart cart. */
export type WalmartSkip =
  /** Walmart says it's out of stock. */
  | "out_of_stock"
  /** Walmart's search found nothing for it. */
  | "not_found"
  /** Nothing picked for it yet. */
  | "no_product"
  /** Walmart's page had no Add to cart, or didn't add it. */
  | "not_added"

/**
 * A Walmart job the extension runs in the person's Walmart tab: finding
 * things, or filling the cart. One at a time; the page follows it.
 */
export type WalmartJob = {
  kind: "find" | "fill"
  /**
   * Running; stopped at Walmart's check that it's a person, for them to
   * finish in the Walmart tab; stopped part way (asked to, or the browser
   * stopped the extension); done; or failed (Merran said no).
   */
  state: "running" | "check" | "stopped" | "done" | "failed"
  householdId: string
  /** Asked to stop: it stops once it's done with the thing it's on. */
  stopping: boolean
  /** What it's looking for or adding now. */
  now: string | null
  done: number
  total: number
  added: { name: string; packages: number }[]
  skipped: { name: string; why: WalmartSkip }[]
  /** Why it failed, as Merran said. */
  error: string | null
  /** When it last moved on. */
  at: string
}

/** What the extension says about itself to a Merran page. */
export type ExtensionStatus = {
  version: string
  /** The households on this Merran the extension is connected to. */
  households: { id: string; name: string }[]
  walmart: {
    /** The person let the extension work on walmart.com. */
    access: boolean
    /** Its Walmart tab is open. */
    tab: boolean
  }
  /** The Walmart job for this Merran, if there is one. */
  job: WalmartJob | null
}

/** Why the extension didn't do what the page asked. */
export type ExtensionNo =
  /** Already working in the Walmart tab. */
  | "busy"
  /** Not allowed on walmart.com yet. */
  | "access"
  /** Not connected to that household. */
  | "household"
  /** Walmart asked whether it's a person. */
  | "check"
  /** Merran said no, or couldn't be reached: see the message. */
  | "failed"

type Answer<T = object> =
  ({ ok: true } & T) | { ok: false; why: ExtensionNo; message?: string }

/** What the page can ask the extension, and what it answers. */
export type ExtensionCalls = {
  status: { args: object; answer: ExtensionStatus }
  /** Opens the extension's page asking to work on walmart.com. */
  "walmart-access": { args: object; answer: Answer }
  /**
   * Finds everything without a product at Walmart, in the Walmart tab: of
   * these things, the ones Send has going to Walmart, if they're given.
   */
  "walmart-find": {
    args: { householdId: string; items?: string[] }
    answer: Answer
  }
  /** Fills the Walmart cart with these lines, one product at a time. */
  "walmart-fill": {
    args: {
      householdId: string
      lines: { itemId: string; packages: number }[]
    }
    answer: Answer
  }
  /** Searches Walmart for some words, to pick a product by hand. */
  "walmart-search": {
    args: { householdId: string; words: string }
    answer: Answer<{ products: StoreProduct[] }>
  }
  /** Carries on with a job that stopped part way or at Walmart's check. */
  "walmart-carry-on": { args: object; answer: Answer }
  /** Stops the job once it's done with the thing it's on. */
  "walmart-stop": { args: object; answer: Answer }
  /** Shows the Walmart tab, opening it if it's closed. */
  "walmart-show": { args: object; answer: Answer }
  /** Forgets a job that's over. */
  "walmart-dismiss": { args: object; answer: Answer }
}

export type ExtensionCommand = keyof ExtensionCalls

/** A call from the page. */
export type ExtensionCall<C extends ExtensionCommand = ExtensionCommand> = {
  source: typeof FROM_PAGE
  type: "extension-call"
  id: string
  command: C
  args: ExtensionCalls[C]["args"]
}

/** What the extension posts to the page. */
export type ExtensionMessage =
  /** It's listening on this page now. */
  | { source: typeof FROM_EXTENSION; type: "extension-here" }
  /** Its answer to a call. */
  | {
      source: typeof FROM_EXTENSION
      type: "extension-answer"
      id: string
      answer: unknown
    }
  /** Something it says about itself changed: its job moved on, say. */
  | {
      source: typeof FROM_EXTENSION
      type: "extension-status"
      status: ExtensionStatus
    }
