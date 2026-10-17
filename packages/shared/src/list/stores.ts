// Stores a household can split its list by, offered for its country. Any
// other store works too, by name. A store with a search address is a
// link-only store: each thing on its list can be found on its site in a
// tap. Store connections (Kroger) build on these keys too. Adding a store,
// or its search, is a line here.

export type Store = {
  /** A stable key: "kroger", "tesco". */
  key: string
  name: string
  /** ISO 3166 countries it's offered in. */
  countries: readonly string[]
  /**
   * Its site's search, with {q} where the words go: one address, or one
   * for each country whose site differs.
   */
  search?: string | Readonly<Record<string, string>>
}

export const STORES: readonly Store[] = [
  // United States
  {
    key: "kroger",
    name: "Kroger",
    countries: ["US"],
    search: "https://www.kroger.com/search?query={q}",
  },
  {
    key: "walmart",
    name: "Walmart",
    countries: ["US", "CA"],
    search: {
      US: "https://www.walmart.com/search?q={q}",
      CA: "https://www.walmart.ca/en/search?q={q}",
    },
  },
  {
    key: "costco",
    name: "Costco",
    countries: ["US", "CA", "GB", "AU"],
    search: {
      US: "https://www.costco.com/s?keyword={q}",
      CA: "https://www.costco.ca/s?keyword={q}",
      GB: "https://www.costco.co.uk/search?text={q}",
      AU: "https://www.costco.com.au/search?text={q}",
    },
  },
  {
    key: "target",
    name: "Target",
    countries: ["US"],
    search: "https://www.target.com/s?searchTerm={q}",
  },
  {
    key: "trader-joes",
    name: "Trader Joe's",
    countries: ["US"],
    search: "https://www.traderjoes.com/home/search?q={q}&section=products",
  },
  {
    key: "whole-foods",
    name: "Whole Foods",
    countries: ["US"],
    search: "https://www.wholefoodsmarket.com/grocery/search?k={q}",
  },
  {
    key: "publix",
    name: "Publix",
    countries: ["US"],
    search: "https://www.publix.com/search?searchTerm={q}",
  },
  {
    key: "safeway",
    name: "Safeway",
    countries: ["US"],
    search: "https://www.safeway.com/shop/search-results.html?q={q}",
  },
  {
    key: "heb",
    name: "H-E-B",
    countries: ["US"],
    search: "https://www.heb.com/search/?q={q}",
  },
  {
    key: "wegmans",
    name: "Wegmans",
    countries: ["US"],
    search: "https://www.wegmans.com/search?search_term={q}",
  },
  {
    key: "sams-club",
    name: "Sam's Club",
    countries: ["US"],
    search: "https://www.samsclub.com/search?q={q}",
  },
  // Canada
  {
    key: "loblaws",
    name: "Loblaws",
    countries: ["CA"],
    search: "https://www.loblaws.ca/en/search?search-bar={q}",
  },
  {
    key: "no-frills",
    name: "No Frills",
    countries: ["CA"],
    search: "https://www.nofrills.ca/en/search?search-bar={q}",
  },
  {
    key: "superstore",
    name: "Real Canadian Superstore",
    countries: ["CA"],
    search: "https://www.realcanadiansuperstore.ca/en/search?search-bar={q}",
  },
  { key: "sobeys", name: "Sobeys", countries: ["CA"] },
  { key: "metro", name: "Metro", countries: ["CA"] },
  // Britain and Ireland
  {
    key: "tesco",
    name: "Tesco",
    countries: ["GB", "IE"],
    search: {
      GB: "https://www.tesco.com/groceries/en-GB/search?query={q}",
      IE: "https://www.tesco.ie/groceries/en-IE/search?query={q}",
    },
  },
  {
    key: "sainsburys",
    name: "Sainsbury's",
    countries: ["GB"],
    search: "https://www.sainsburys.co.uk/gol-ui/SearchResults/{q}",
  },
  {
    key: "asda",
    name: "Asda",
    countries: ["GB"],
    search: "https://groceries.asda.com/search/{q}",
  },
  {
    key: "morrisons",
    name: "Morrisons",
    countries: ["GB"],
    search: "https://groceries.morrisons.com/search?q={q}",
  },
  {
    key: "waitrose",
    name: "Waitrose",
    countries: ["GB"],
    search: "https://www.waitrose.com/ecom/shop/search?searchTerm={q}",
  },
  { key: "co-op", name: "Co-op", countries: ["GB"] },
  { key: "marks-and-spencer", name: "M&S", countries: ["GB"] },
  {
    key: "ocado",
    name: "Ocado",
    countries: ["GB"],
    search: "https://www.ocado.com/search?entry={q}",
  },
  { key: "dunnes", name: "Dunnes Stores", countries: ["IE"] },
  { key: "supervalu", name: "SuperValu", countries: ["IE"] },
  // Australia and New Zealand
  {
    key: "woolworths",
    name: "Woolworths",
    countries: ["AU", "NZ"],
    search: {
      AU: "https://www.woolworths.com.au/shop/search/products?searchTerm={q}",
      NZ: "https://www.woolworths.co.nz/shop/searchproducts?search={q}",
    },
  },
  {
    key: "coles",
    name: "Coles",
    countries: ["AU"],
    search: "https://www.coles.com.au/search/products?q={q}",
  },
  { key: "iga", name: "IGA", countries: ["AU"] },
  {
    key: "new-world",
    name: "New World",
    countries: ["NZ"],
    search: "https://www.newworld.co.nz/shop/search?q={q}",
  },
  {
    key: "paknsave",
    name: "PAK'nSAVE",
    countries: ["NZ"],
    search: "https://www.paknsave.co.nz/shop/search?q={q}",
  },
  // Across Europe and beyond
  { key: "aldi", name: "Aldi", countries: ["US", "GB", "IE", "AU", "DE"] },
  { key: "lidl", name: "Lidl", countries: ["US", "GB", "IE", "DE"] },
]

export const STORES_BY_KEY: ReadonlyMap<string, Store> = new Map(
  STORES.map((store) => [store.key, store])
)

/**
 * The stores offered for a country, by name: every one Merran knows when
 * the household hasn't said its country, none for a country it has no
 * stores for (any store can still be named).
 */
export function storesFor(country: string | null | undefined) {
  const code = country?.toUpperCase()
  return STORES.filter((store) => !code || store.countries.includes(code))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Where to look for something on a store's site, in the household's
 * country: null for a store without a search (or one for that country).
 */
export function storeSearch(
  storeKey: string | null | undefined,
  country: string | null | undefined,
  words: string
) {
  const search = storeKey ? STORES_BY_KEY.get(storeKey)?.search : undefined
  if (!search) return null
  const code = country?.toUpperCase()
  const address =
    typeof search === "string"
      ? search
      : ((code && search[code]) ?? Object.values(search)[0])
  if (!address) return null
  // "(75 g) butter" is looked for as butter.
  const looked = words
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return address.replace("{q}", encodeURIComponent(looked || words.trim()))
}
