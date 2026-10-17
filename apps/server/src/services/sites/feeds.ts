import { load, type Cheerio, type CheerioAPI } from "cheerio"
import { AppError } from "../../core/errors.ts"
import type { Fetcher } from "../fetch/public-fetch.ts"
import { decodeHtml } from "../recipes/import/import-link.ts"

// A recipe site's feed (RSS or Atom): finding it from any page of the site,
// and reading its newest posts.

/** A post in a feed. */
export type FeedItem = {
  url: string
  title: string | null
  publishedAt: Date | null
  /** A photo the feed gives with it, if any. */
  photoUrl: string | null
}

export type Feed = {
  title: string | null
  /** The site's home page, as the feed says. */
  siteUrl: string | null
  /** The language the feed says it's in, like "en". */
  language: string | null
  items: FeedItem[]
}

/** The most posts read from a feed: the newest. */
const MOST_ITEMS = 30

/** Where sites usually keep their feed, tried when a page doesn't say. */
const USUAL_PLACES = ["/feed/", "/rss.xml", "/feed", "/atom.xml", "/index.xml"]

const ACCEPT_FEED =
  "application/rss+xml,application/atom+xml,application/xml;q=0.9,text/xml;q=0.9,*/*;q=0.5"

/** Cheerio's nodes: their type is from domhandler, which Merran doesn't depend on itself. */
type Nodes = Cheerio<
  Exclude<Parameters<typeof load>[0], string | Buffer | readonly unknown[]>
>

const text = (node: Nodes) =>
  node.first().text().replace(/\s+/g, " ").trim() || null

function absolute(link: string | null | undefined, base: string) {
  if (!link?.trim()) return null
  try {
    const url = new URL(link.trim(), base)
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null
  } catch {
    return null
  }
}

function date(value: string | null) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/** Whether a body is a feed rather than a web page. */
export function looksLikeFeed(body: string, contentType: string) {
  if (/(rss|atom)\+xml/i.test(contentType)) return true
  const start = body.slice(0, 1000).replace(/^﻿/, "").trimStart()
  return /^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<(rss|feed|rdf:RDF)[\s>]/i.test(
    start
  )
}

/** The first photo in a post's HTML, if it has one. */
function firstImage(html: string | null, base: string) {
  if (!html || !/<img/i.test(html)) return null
  return absolute(load(html)("img").first().attr("src"), base)
}

/** A post's photo: media tags, an image enclosure, or the first in its text. */
function photoOf($: CheerioAPI, item: Nodes, base: string) {
  const media = item
    .find("media\\:content, media\\:thumbnail")
    .toArray()
    .map((node) => $(node))
    .find((node) => {
      const type = node.attr("type") ?? ""
      const medium = node.attr("medium") ?? ""
      return (
        node.is("media\\:thumbnail") ||
        medium === "image" ||
        type.startsWith("image/") ||
        (!type && !medium)
      )
    })
  const enclosure = item
    .find("enclosure")
    .toArray()
    .map((node) => $(node))
    .find((node) => (node.attr("type") ?? "").startsWith("image/"))
  return (
    absolute(media?.attr("url"), base) ??
    absolute(enclosure?.attr("url"), base) ??
    firstImage(
      text(item.find("content\\:encoded")) ??
        item.find("content").first().text() ??
        null,
      base
    ) ??
    firstImage(item.find("description").first().text() || null, base)
  )
}

/** Reads an RSS or Atom feed: its title, site, language and newest posts. */
export function parseFeed(xml: string, feedUrl: string): Feed {
  const $ = load(xml, { xml: true })
  const atom = $("feed").length > 0 && $("rss, rdf\\:RDF").length === 0

  if (atom) {
    const feed = $("feed").first()
    const siteUrl = absolute(
      feed
        .children("link")
        .toArray()
        .map((node) => $(node))
        .find((node) => (node.attr("rel") ?? "alternate") === "alternate")
        ?.attr("href"),
      feedUrl
    )
    const items = feed
      .children("entry")
      .toArray()
      .map((node) => {
        const entry = $(node)
        const link = entry
          .children("link")
          .toArray()
          .map((child) => $(child))
          .find((child) => (child.attr("rel") ?? "alternate") === "alternate")
        const url = absolute(link?.attr("href"), siteUrl ?? feedUrl)
        if (!url) return null
        return {
          url,
          title: text(entry.children("title")),
          publishedAt: date(
            text(entry.children("published")) ?? text(entry.children("updated"))
          ),
          photoUrl: photoOf($, entry, url),
        }
      })
    return {
      title: text(feed.children("title")),
      siteUrl,
      language: feed.attr("xml:lang")?.toLowerCase() ?? null,
      items: items.filter((item) => item !== null).slice(0, MOST_ITEMS),
    }
  }

  const channel = $("channel").first()
  const siteUrl = absolute(text(channel.children("link")), feedUrl)
  const items = $("item")
    .toArray()
    .map((node) => {
      const item = $(node)
      const guid = item.children("guid").first()
      const url =
        absolute(text(item.children("link")), feedUrl) ??
        (guid.attr("isPermaLink") !== "false"
          ? absolute(text(guid), feedUrl)
          : null)
      if (!url) return null
      return {
        url,
        title: text(item.children("title")),
        publishedAt: date(
          text(item.children("pubDate")) ?? text(item.children("dc\\:date"))
        ),
        photoUrl: photoOf($, item, url),
      }
    })
  return {
    title: text(channel.children("title")),
    siteUrl,
    language: text(channel.children("language"))?.toLowerCase() ?? null,
    items: items.filter((item) => item !== null).slice(0, MOST_ITEMS),
  }
}

/** The feeds a page links to, not its comments' feed. */
function linkedFeeds(html: string, pageUrl: string) {
  const $ = load(html)
  return $(
    'link[rel~="alternate"][type="application/rss+xml"], link[rel~="alternate"][type="application/atom+xml"]'
  )
    .toArray()
    .map((node) => ({
      href: absolute($(node).attr("href"), pageUrl),
      title: $(node).attr("title") ?? "",
    }))
    .filter(
      (feed): feed is { href: string; title: string } =>
        feed.href !== null &&
        !/comment/i.test(feed.href) &&
        !/comment/i.test(feed.title)
    )
    .map((feed) => feed.href)
}

const noFeed = () =>
  new AppError(
    "unprocessable",
    "no_feed",
    "Merran couldn't find that site's feed, so it can't follow it. Try its home page, or the address of its feed."
  )

/** A feed at an address, read; or null if it isn't one. */
async function tryFeed(fetcher: Fetcher, url: string) {
  try {
    const answer = await fetcher(url, {
      accept: ACCEPT_FEED,
      maxBytes: 5_000_000,
    })
    const body = decodeHtml(answer.body, answer.contentType)
    if (!looksLikeFeed(body, answer.contentType)) return null
    const feed = parseFeed(body, answer.url)
    return { feedUrl: answer.url, feed }
  } catch {
    return null
  }
}

/**
 * A site's feed, from any page of it or the feed's own address: the feed
 * itself, the one the page links to, or one where sites usually keep it
 * (also when the page turns Merran away).
 */
export async function findFeed(fetcher: Fetcher, url: string) {
  let page: { url: string; body: string } | null = null
  try {
    const answer = await fetcher(url, { accept: ACCEPT_FEED })
    const body = decodeHtml(answer.body, answer.contentType)
    if (looksLikeFeed(body, answer.contentType)) {
      return { feedUrl: answer.url, feed: parseFeed(body, answer.url) }
    }
    page = { url: answer.url, body }
  } catch (err) {
    if (err instanceof AppError && err.code === "private_address") throw err
  }

  const tried = new Set<string>()
  const candidates = [
    ...(page ? linkedFeeds(page.body, page.url) : []),
    ...USUAL_PLACES.map((path) => new URL(path, page?.url ?? url).toString()),
  ]
  for (const candidate of candidates) {
    if (tried.has(candidate)) continue
    tried.add(candidate)
    const found = await tryFeed(fetcher, candidate)
    if (found && found.feed.items.length > 0) return found
  }
  throw noFeed()
}
