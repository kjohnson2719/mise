import { describe, expect, test } from "vitest"
import { siteData } from "./data.ts"
import { fitsRule, inSeason, pickFor, seasonOf } from "./collections.ts"
import { looksLikeFeed, parseFeed } from "./feeds.ts"
import { mayRead, parseRobots } from "./robots.ts"
import { coursesOf } from "./shelf.ts"
import type { SiteRecipe } from "../../database/entities/index.ts"

describe("robots.txt", () => {
  const robots = parseRobots(`
# Everyone
User-agent: *
Disallow: /wp-admin/
Allow: /wp-admin/admin-ajax.php
Disallow: /*?print=
Disallow: /*.pdf$

User-agent: GPTBot
Disallow: /
`)

  test("follows the rules for every robot, longest first", () => {
    expect(mayRead(robots, "/honey-garlic-chicken/")).toBe(true)
    expect(mayRead(robots, "/wp-admin/options.php")).toBe(false)
    expect(mayRead(robots, "/wp-admin/admin-ajax.php")).toBe(true)
    expect(mayRead(robots, "/soup/?print=1")).toBe(false)
    expect(mayRead(robots, "/menu.pdf")).toBe(false)
    expect(mayRead(robots, "/menu.pdf?x=1")).toBe(true)
  })

  test("takes the rules naming Merran over everyone's", () => {
    const named = parseRobots(`
User-agent: *
Disallow:

User-agent: Merran
Disallow: /recipes/
Crawl-delay: 10
`)
    expect(mayRead(named, "/recipes/soup")).toBe(false)
    expect(mayRead(named, "/blog/")).toBe(true)
    expect(named.crawlDelay).toBe(10)
  })

  test("allows everything when nothing is said", () => {
    expect(mayRead(parseRobots(""), "/anything")).toBe(true)
    expect(mayRead(parseRobots("User-agent: *\nDisallow:\n"), "/x")).toBe(true)
  })
})

describe("feeds", () => {
  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel>
  <title>RecipeTin Eats</title>
  <link>https://www.recipetineats.com/</link>
  <language>en-AU</language>
  <item>
    <title>Honey Garlic Chicken</title>
    <link>https://www.recipetineats.com/honey-garlic-chicken/</link>
    <pubDate>Tue, 14 Oct 2026 08:00:00 +0000</pubDate>
    <content:encoded><![CDATA[<p><img src="/images/chicken.jpg"></p>]]></content:encoded>
  </item>
  <item>
    <title>Pumpkin Soup</title>
    <link>https://www.recipetineats.com/pumpkin-soup/</link>
    <media:content url="https://cdn.example/pumpkin.jpg" medium="image" />
  </item>
</channel>
</rss>`

  test("reads RSS: posts, dates and photos", () => {
    expect(looksLikeFeed(rss, "text/xml")).toBe(true)
    const feed = parseFeed(rss, "https://www.recipetineats.com/feed/")
    expect(feed).toMatchObject({
      title: "RecipeTin Eats",
      siteUrl: "https://www.recipetineats.com/",
      language: "en-au",
    })
    expect(feed.items).toEqual([
      {
        url: "https://www.recipetineats.com/honey-garlic-chicken/",
        title: "Honey Garlic Chicken",
        publishedAt: new Date("2026-10-14T08:00:00Z"),
        photoUrl: "https://www.recipetineats.com/images/chicken.jpg",
      },
      {
        url: "https://www.recipetineats.com/pumpkin-soup/",
        title: "Pumpkin Soup",
        publishedAt: null,
        photoUrl: "https://cdn.example/pumpkin.jpg",
      },
    ])
  })

  test("reads Atom", () => {
    const atom = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="en">
  <title>Cooking</title>
  <link href="https://cooking.example/" />
  <link rel="self" href="https://cooking.example/atom.xml" />
  <entry>
    <title>Lentil Stew</title>
    <link rel="alternate" href="/lentil-stew" />
    <published>2026-10-10T12:00:00Z</published>
  </entry>
</feed>`
    const feed = parseFeed(atom, "https://cooking.example/atom.xml")
    expect(feed.siteUrl).toBe("https://cooking.example/")
    expect(feed.items).toEqual([
      {
        url: "https://cooking.example/lentil-stew",
        title: "Lentil Stew",
        publishedAt: new Date("2026-10-10T12:00:00Z"),
        photoUrl: null,
      },
    ])
  })

  test("knows a web page isn't one", () => {
    expect(looksLikeFeed("<!doctype html><html></html>", "text/html")).toBe(
      false
    )
  })
})

/** A recipe on the shelf, as the rules see it. */
function shelf(name: string, more: Partial<SiteRecipe> = {}): SiteRecipe {
  return {
    id: name,
    url: `https://cooking.example/${name.toLowerCase().replace(/\W+/g, "-")}`,
    name,
    courses: [],
    keywords: [],
    diets: [],
    minutes: null,
    classic: false,
    publishedAt: null,
    createdAt: new Date("2026-01-01"),
    ...more,
  } as unknown as SiteRecipe
}

describe("collection rules", () => {
  test("courses come from what sites call them", () => {
    expect(coursesOf(["Main Course", "Dinner"])).toEqual(["main"])
    expect(coursesOf(["Soups", "Brunch"])).toEqual(["soup", "breakfast"])
    expect(coursesOf(["Mexican"])).toEqual([])
  })

  test("a course or a word, and everything else", () => {
    const soups = { courses: ["soup" as const], words: ["chowder", "stew"] }
    expect(fitsRule(soups, shelf("Pumpkin Soup", { courses: ["soup"] }))).toBe(
      true
    )
    expect(fitsRule(soups, shelf("Corn Chowder"))).toBe(true)
    expect(fitsRule(soups, shelf("Irish Stews"))).toBe(true)
    expect(fitsRule(soups, shelf("Stewart's Cake"))).toBe(false)

    const weeknight = { courses: ["main" as const], maxMinutes: 40 }
    expect(
      fitsRule(weeknight, shelf("Stir Fry", { courses: ["main"], minutes: 20 }))
    ).toBe(true)
    expect(
      fitsRule(weeknight, shelf("Roast", { courses: ["main"], minutes: 120 }))
    ).toBe(false)
    expect(fitsRule(weeknight, shelf("Unknown", { courses: ["main"] }))).toBe(
      false
    )

    const vegetarian = {
      courses: ["main" as const],
      diets: ["vegetarian" as const],
    }
    expect(
      fitsRule(
        vegetarian,
        shelf("Dal", { courses: ["main"], diets: ["vegetarian", "vegan"] })
      )
    ).toBe(true)
    expect(fitsRule(vegetarian, shelf("Chili", { courses: ["main"] }))).toBe(
      false
    )

    const pasta = { words: ["pasta"], without: ["salad"] }
    expect(fitsRule(pasta, shelf("Pasta Salad"))).toBe(false)
    expect(
      fitsRule(pasta, shelf("Cacio e Pepe", { keywords: ["pasta", "italian"] }))
    ).toBe(true)
  })

  test("seasons turn round in the south", () => {
    expect(seasonOf(10, false)).toBe("autumn")
    expect(seasonOf(10, true)).toBe("spring")
    expect(seasonOf(1, true)).toBe("summer")
    const autumn = { words: ["pumpkin"], seasons: ["autumn" as const] }
    expect(inSeason(autumn, 10, false)).toBe(true)
    expect(inSeason(autumn, 4, true)).toBe(true)
    expect(inSeason(autumn, 4, false)).toBe(false)
    // Months are the same everywhere: Christmas is in December.
    expect(inSeason({ months: [12] }, 12, true)).toBe(true)
  })

  test("this month's posts come first, then the classics, then the rest", () => {
    const collection = {
      id: "soups",
      title: "Soups",
      description: "Soups.",
      theme: "Soups",
      rule: { words: ["soup"] },
      classics: [
        { url: "https://cooking.example/classic-two", site: "Cooking" },
        { url: "https://cooking.example/classic-one", site: "Cooking" },
      ],
    }
    const picked = pickFor(collection, [
      shelf("New Soup", { publishedAt: new Date() }),
      shelf("Old Soup", { publishedAt: new Date("2025-01-01") }),
      shelf("Classic One", { classic: true }),
      shelf("Classic Two", { classic: true }),
      shelf("Cake", { publishedAt: new Date() }),
    ])
    expect(picked.map((row) => row.name)).toEqual([
      "New Soup",
      "Classic Two",
      "Classic One",
      "Old Soup",
    ])
  })
})

describe("the data files", () => {
  test("read, with unique collections and classics that fit their sites", () => {
    const english = siteData().get("en")!
    const ids = english.collections.map((collection) => collection.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(english.collections.length).toBeGreaterThanOrEqual(9)
    expect(english.sites.length).toBeGreaterThanOrEqual(10)
    for (const collection of english.collections) {
      const urls = collection.classics.map((classic) => classic.url)
      expect(new Set(urls).size, collection.id).toBe(urls.length)
    }
  })
})
