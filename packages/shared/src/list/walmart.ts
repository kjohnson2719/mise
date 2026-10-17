import { readProductSize, type StoreProduct } from "./products.ts"

// Walmart, through Merran's browser extension: the extension opens Walmart's
// own pages in the person's tab and hands back what it read there, and this
// makes sense of it. Merran never talks to Walmart itself, and never gets
// past Walmart's check that it's a person: it stops there and asks them.

export const WALMART = "walmart"
export const WALMART_ORIGIN = "https://www.walmart.com"
export const WALMART_CART_URL = `${WALMART_ORIGIN}/cart`

/** Walmart's search for some words. */
export const walmartSearchUrl = (words: string) =>
  `${WALMART_ORIGIN}/search?q=${encodeURIComponent(words)}`

/** A product's page on Walmart, by its id. */
export const walmartProductUrl = (id: string) =>
  `${WALMART_ORIGIN}/ip/${encodeURIComponent(id)}`

/** What the extension reads from a Walmart page. */
export type WalmartPage = {
  url: string
  title: string
  /** The start of the page's text. */
  text: string
  /** Its page data (`__NEXT_DATA__`), as text, if it has any. */
  data: string | null
}

/**
 * Whether Walmart is asking if it's a person (its "press and hold"),
 * rather than showing the page: by its title, its address, or its words.
 */
export function isWalmartCheck(
  page: Pick<WalmartPage, "url" | "title" | "text">
) {
  if (/robot or human/i.test(page.title)) return true
  if (pathOf(page.url).startsWith("/blocked")) return true
  return /robot or human\?|press\s*(?:&|and)\s*hold/i.test(
    page.text.slice(0, 3000)
  )
}

/** An address's path: "/blocked" in "https://www.walmart.com/blocked?u=". */
const pathOf = (url: string) =>
  url.replace(/^[a-z]+:\/\/[^/?#]*/i, "").replace(/[?#].*$/, "")

/** The most products from a search Merran picks among. */
const OFFERED = 8

/**
 * The products on a Walmart search page, from its page data: Walmart's
 * order, with sponsored ones after the rest and what's out of stock last.
 * Null when the page has no results to read yet (still loading, or not a
 * search page); empty when Walmart found nothing.
 */
export function walmartSearchResults(
  data: string | null,
  most = OFFERED
): StoreProduct[] | null {
  const root = parse(data)
  const stacks = at(
    root,
    "props",
    "pageProps",
    "initialData",
    "searchResult",
    "itemStacks"
  )
  if (!Array.isArray(stacks)) return null
  const items = stacks
    .flatMap((stack) => {
      const list = at(stack, "items")
      return Array.isArray(list) ? list : []
    })
    .filter(
      (item) =>
        typeof at(item, "usItemId") === "string" &&
        typeof at(item, "name") === "string"
    )
  const ranked = items
    .slice(0, 40)
    .map((item, order) => ({ item, order, product: fromSearch(item) }))
    .sort(
      (a, b) =>
        rank(a.product, a.item) - rank(b.product, b.item) || a.order - b.order
    )
  return ranked.slice(0, most).map(({ product }) => product)
}

/** Out of stock counts most against a product, then being an ad. */
const rank = (product: StoreProduct, item: unknown) =>
  (product.inStock ? 0 : 2) + (at(item, "isSponsoredFlag") === true ? 1 : 0)

/** The product on a Walmart product page, from its page data, if it is one. */
export function walmartProductPage(data: string | null): StoreProduct | null {
  const product = at(
    parse(data),
    "props",
    "pageProps",
    "initialData",
    "data",
    "product"
  )
  const id = at(product, "usItemId")
  const name = at(product, "name")
  if (typeof id !== "string" || typeof name !== "string") return null
  return toProduct({
    id,
    name,
    price: dollars(at(product, "priceInfo", "currentPrice", "price")),
    was: dollars(at(product, "priceInfo", "wasPrice", "price")),
    image: text(at(product, "imageInfo", "thumbnailUrl")),
    url: walmartProductUrl(id),
    inStock: at(product, "availabilityStatus") !== "OUT_OF_STOCK",
    brand: text(at(product, "brand")),
    upc: text(at(product, "upc")),
  })
}

function fromSearch(item: unknown): StoreProduct {
  const id = at(item, "usItemId") as string
  const canonical = text(at(item, "canonicalUrl"))
  const availability = at(item, "availabilityStatusV2", "value")
  return toProduct({
    id,
    name: at(item, "name") as string,
    price:
      dollars(at(item, "price")) ??
      dollars(at(item, "priceInfo", "currentPrice", "price")),
    was: dollars(at(item, "priceInfo", "wasPrice", "price")),
    image:
      text(at(item, "imageInfo", "thumbnailUrl")) ?? text(at(item, "image")),
    url: canonical
      ? `${WALMART_ORIGIN}${canonical.split("?")[0]}`
      : walmartProductUrl(id),
    // Walmart says when it's out; nothing said is taken as there.
    inStock: availability !== "OUT_OF_STOCK",
    brand: text(at(item, "brand")),
    upc: null,
  })
}

type Read = {
  id: string
  name: string
  price: number | null
  was: number | null
  image: string | null
  url: string
  inStock: boolean
  brand: string | null
  upc: string | null
}

/**
 * As Merran keeps a product: in cents, a price "was" more than it is now a
 * sale off the regular price, the size from its name, and only https.
 */
function toProduct(read: Read): StoreProduct {
  const onSale =
    read.price !== null && read.was !== null && read.was > read.price
  return {
    id: read.id.slice(0, 64),
    upc: read.upc?.slice(0, 20) ?? null,
    name: read.name.slice(0, 300),
    brand: read.brand?.slice(0, 120) ?? null,
    size: sizeFromName(read.name),
    image: read.image?.startsWith("https://")
      ? read.image.slice(0, 1000)
      : null,
    price: onSale ? read.was : read.price,
    salePrice: onSale ? read.price : null,
    saleEnds: null,
    currency: "USD",
    aisle: null,
    inStock: read.inStock,
    url: read.url.startsWith(`${WALMART_ORIGIN}/`)
      ? read.url.slice(0, 1000)
      : null,
  }
}

/** Words for units Walmart spells out, as Merran reads sizes. */
const SPELLED: [RegExp, string][] = [
  [/\bfluid\s+ounces?\b/gi, "fl oz"],
  [/\bgallons?\b/gi, "gal"],
  [/\bpounds?\b/gi, "lb"],
  [/\bounces?\b/gi, "oz"],
  [/\bquarts?\b/gi, "qt"],
  [/\bpints?\b/gi, "pt"],
  [/\blit(?:er|re)s?\b/gi, "l"],
  [/\bcounts?\b/gi, "ct"],
]

/**
 * A product's size from its name, as Walmart writes them: the last part
 * after a comma that's a size, "Whole Milk, 1 Gallon" is "1 gal".
 */
export function sizeFromName(name: string): string | null {
  const parts = name.split(",").map((part) => part.trim())
  for (const part of parts.reverse()) {
    const size = SPELLED.reduce(
      (words, [spelled, short]) => words.replace(spelled, short),
      part
    )
    // "Gallon" alone is one gallon.
    const whole = /^(gal|lb|qt|pt)$/i.test(size) ? `1 ${size}` : size
    if (readProductSize(whole).length > 0) return whole.slice(0, 60)
  }
  return null
}

function parse(data: string | null): unknown {
  if (!data) return null
  try {
    return JSON.parse(data)
  } catch {
    return null
  }
}

function at(value: unknown, ...path: string[]): unknown {
  let here = value
  for (const step of path) {
    if (!here || typeof here !== "object") return undefined
    here = (here as Record<string, unknown>)[step]
  }
  return here
}

const text = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null

/** Dollars as cents, when it's a price at all. */
function dollars(value: unknown) {
  const number = typeof value === "string" ? Number(value) : value
  return typeof number === "number" &&
    Number.isFinite(number) &&
    number >= 0 &&
    number < 100_000
    ? Math.round(number * 100)
    : null
}
