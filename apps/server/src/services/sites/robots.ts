import type { Fetcher } from "../fetch/public-fetch.ts"

// Sites say in robots.txt what robots may read. Merran is one when it reads
// sites in the background (feeds, their posts, the collections' classics),
// so it asks first. Importing a link someone pasted isn't: that's a person
// asking for a page, as a browser would.

/** The name Merran goes by in robots.txt. */
const AGENT = "merran"

/** How long what a site said is kept; a site that couldn't say is asked again sooner. */
const KEEP_MS = 24 * 60 * 60_000
const RETRY_MS = 60 * 60_000

type Rule = { allow: boolean; pattern: string }

/** What one site's robots.txt says for Merran. */
export type Robots = {
  rules: Rule[]
  /** Seconds to wait between pages, if it asks. */
  crawlDelay: number | null
}

const EVERYTHING: Robots = { rules: [], crawlDelay: null }
const NOTHING: Robots = {
  rules: [{ allow: false, pattern: "/" }],
  crawlDelay: null,
}

/**
 * Reads robots.txt for Merran: the group naming it, or else the one for
 * every robot (`*`). Several groups for the same robot count as one.
 */
export function parseRobots(text: string): Robots {
  type Group = { agents: string[]; rules: Rule[]; crawlDelay: number | null }
  const groups: Group[] = []
  let current: Group | null = null
  let lastWasAgent = false

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim()
    const colon = line.indexOf(":")
    if (colon < 1) continue
    const field = line.slice(0, colon).trim().toLowerCase()
    const value = line.slice(colon + 1).trim()

    if (field === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [], crawlDelay: null }
        groups.push(current)
      }
      current.agents.push(value.toLowerCase())
      lastWasAgent = true
      continue
    }
    lastWasAgent = false
    if (!current) continue
    if (field === "allow" || field === "disallow") {
      // An empty Disallow allows everything: no rule.
      if (value)
        current.rules.push({ allow: field === "allow", pattern: value })
    } else if (field === "crawl-delay") {
      const seconds = Number(value)
      if (Number.isFinite(seconds) && seconds >= 0) current.crawlDelay = seconds
    }
  }

  const named = groups.filter((group) =>
    group.agents.some((agent) => agent !== "*" && AGENT.startsWith(agent))
  )
  const chosen =
    named.length > 0
      ? named
      : groups.filter((group) => group.agents.includes("*"))
  return {
    rules: chosen.flatMap((group) => group.rules),
    crawlDelay:
      chosen.map((group) => group.crawlDelay).find((delay) => delay !== null) ??
      null,
  }
}

/** Whether a robots.txt pattern matches a path: `*` is anything, `$` the end. */
function matches(pattern: string, path: string) {
  const anchored = pattern.endsWith("$")
  const body = anchored ? pattern.slice(0, -1) : pattern
  const source = body
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*")
  return new RegExp(`^${source}${anchored ? "$" : ""}`).test(path)
}

/**
 * Whether Merran may read a path: the longest rule that matches decides,
 * and Allow wins a tie. No rule matching allows it.
 */
export function mayRead(robots: Robots, path: string) {
  let best: Rule | null = null
  for (const rule of robots.rules) {
    if (!matches(rule.pattern, path)) continue
    if (
      !best ||
      rule.pattern.length > best.pattern.length ||
      (rule.pattern.length === best.pattern.length && rule.allow)
    ) {
      best = rule
    }
  }
  return best?.allow ?? true
}

const known = new Map<string, { robots: Robots; until: number }>()

/**
 * What a site's robots.txt says for Merran, asked once a day. No robots.txt
 * (a 404) allows everything; one that won't answer allows nothing for now,
 * as search engines do.
 */
export async function robotsFor(fetcher: Fetcher, url: string) {
  const origin = new URL(url).origin
  const kept = known.get(origin)
  if (kept && kept.until > Date.now()) return kept.robots

  let robots: Robots
  let keep = KEEP_MS
  try {
    const answer = await fetcher(`${origin}/robots.txt`, {
      accept: "text/plain,*/*;q=0.5",
      maxBytes: 500_000,
      keepErrors: true,
    })
    if (answer.status >= 500) {
      robots = NOTHING
      keep = RETRY_MS
    } else if (answer.status >= 400) {
      robots = EVERYTHING
    } else {
      robots = parseRobots(answer.body.toString("utf8"))
    }
  } catch {
    robots = NOTHING
    keep = RETRY_MS
  }
  known.set(origin, { robots, until: Date.now() + keep })
  return robots
}

/** Whether Merran may read this page in the background. */
export async function allowedByRobots(fetcher: Fetcher, url: string) {
  const parsed = new URL(url)
  const robots = await robotsFor(fetcher, url)
  return mayRead(robots, parsed.pathname + parsed.search)
}

/** Forgets what sites said, for tests. */
export function forgetRobots() {
  known.clear()
}
