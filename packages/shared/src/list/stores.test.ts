import { describe, expect, test } from "vitest"
import { STORES, STORES_BY_KEY, storeSearch, storesFor } from "./stores.ts"

describe("stores", () => {
  test("are offered for the household's country, by name", () => {
    const names = storesFor("GB").map((store) => store.name)
    expect(names).toContain("Tesco")
    expect(names).toContain("Aldi")
    expect(names).not.toContain("Kroger")
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
    expect(storesFor("us").map((store) => store.key)).toContain("kroger")
  })

  test("are none for a country Merran has none for, and all for no country", () => {
    expect(storesFor("ZZ")).toEqual([])
    expect(storesFor(null)).toHaveLength(STORES.length)
  })

  test("have keys of their own", () => {
    expect(STORES_BY_KEY.size).toBe(STORES.length)
    for (const store of STORES) expect(store.key).toMatch(/^[a-z0-9-]+$/)
  })

  test("find things on their sites, in the household's country", () => {
    expect(storeSearch("target", "US", "ground beef")).toBe(
      "https://www.target.com/s?searchTerm=ground%20beef"
    )
    expect(storeSearch("costco", "GB", "milk")).toBe(
      "https://www.costco.co.uk/search?text=milk"
    )
    expect(storeSearch("tesco", "IE", "eggs & bacon")).toBe(
      "https://www.tesco.ie/groceries/en-IE/search?query=eggs%20%26%20bacon"
    )
    // A country it has no site for: its first.
    expect(storeSearch("costco", null, "milk")).toBe(
      "https://www.costco.com/s?keyword=milk"
    )
    // What's in brackets isn't looked for.
    expect(storeSearch("target", "US", "(75 g) butter")).toBe(
      "https://www.target.com/s?searchTerm=butter"
    )
    expect(storeSearch("aldi", "US", "milk")).toBeNull()
    expect(storeSearch(null, "US", "milk")).toBeNull()
  })

  test("searches are https, with a place for the words", () => {
    for (const store of STORES) {
      const searches =
        typeof store.search === "string"
          ? [store.search]
          : Object.values(store.search ?? {})
      for (const search of searches) {
        expect(search, store.key).toMatch(/^https:\/\/[^ ]+\{q\}/)
      }
    }
  })
})
