import { describe, expect, test } from "vitest"
import {
  isWalmartCheck,
  sizeFromName,
  walmartProductPage,
  walmartSearchResults,
  walmartSearchUrl,
} from "./walmart.ts"

// Reading what the extension brings back from Walmart's pages.

const page = (initialData: unknown) =>
  JSON.stringify({ props: { pageProps: { initialData } } })

const item = (
  id: string,
  name: string,
  more: Record<string, unknown> = {}
) => ({
  usItemId: id,
  name,
  price: 3.48,
  imageInfo: { thumbnailUrl: `https://i5.walmartimages.com/${id}.jpg` },
  canonicalUrl: `/ip/${id}?classType=REGULAR`,
  availabilityStatusV2: { value: "IN_STOCK" },
  brand: "Great Value",
  ...more,
})

describe("a search page", () => {
  const data = page({
    searchResult: {
      itemStacks: [
        {
          items: [
            item("1", "Sponsored Milk, 1 Gallon", { isSponsoredFlag: true }),
            item("2", "Great Value Whole Milk, 1 Gallon", {
              price: 3.12,
              priceInfo: { wasPrice: { price: 3.48 } },
            }),
            item("3", "Out Milk, 64 fl oz", {
              availabilityStatusV2: { value: "OUT_OF_STOCK" },
            }),
            item("4", "Organic Milk, Half Gallon, 64 fl oz"),
            { name: "A banner, not a product" },
          ],
        },
      ],
    },
  })

  test("reads its products, ads after the rest and what's out last", () => {
    const products = walmartSearchResults(data)!
    expect(products.map((product) => product.id)).toEqual(["2", "4", "1", "3"])
    expect(products[0]).toEqual({
      id: "2",
      upc: null,
      name: "Great Value Whole Milk, 1 Gallon",
      brand: "Great Value",
      size: "1 gal",
      image: "https://i5.walmartimages.com/2.jpg",
      // On sale: 3.12, usually 3.48.
      price: 348,
      salePrice: 312,
      saleEnds: null,
      currency: "USD",
      aisle: null,
      inStock: true,
      url: "https://www.walmart.com/ip/2",
    })
    expect(products[3]).toMatchObject({ id: "3", inStock: false })
  })

  test("keeps to the most asked for", () => {
    expect(walmartSearchResults(data, 2)).toHaveLength(2)
  })

  test("is nothing yet while it's loading, and empty when nothing's found", () => {
    expect(walmartSearchResults(null)).toBeNull()
    expect(walmartSearchResults("not json")).toBeNull()
    expect(walmartSearchResults(page({}))).toBeNull()
    expect(
      walmartSearchResults(page({ searchResult: { itemStacks: [] } }))
    ).toEqual([])
  })
})

test("a product page", () => {
  const data = page({
    data: {
      product: {
        usItemId: "10450114",
        name: "Great Value 2% Reduced Fat Milk, Gallon, 128 fl oz",
        priceInfo: { currentPrice: { price: 3.27 } },
        imageInfo: { thumbnailUrl: "https://i5.walmartimages.com/m.jpg" },
        availabilityStatus: "IN_STOCK",
        brand: "Great Value",
        upc: "078742351865",
      },
    },
  })
  expect(walmartProductPage(data)).toMatchObject({
    id: "10450114",
    upc: "078742351865",
    size: "128 fl oz",
    price: 327,
    salePrice: null,
    url: "https://www.walmart.com/ip/10450114",
  })
  expect(walmartProductPage(page({ data: {} }))).toBeNull()
})

test("its check that it's a person, however Walmart shows it", () => {
  const plain = {
    url: "https://www.walmart.com/search?q=milk",
    title: "Milk - Walmart.com",
    text: "Results for milk",
  }
  expect(isWalmartCheck(plain)).toBe(false)
  expect(isWalmartCheck({ ...plain, title: "Robot or human?" })).toBe(true)
  expect(
    isWalmartCheck({ ...plain, url: "https://www.walmart.com/blocked?url=..." })
  ).toBe(true)
  expect(
    isWalmartCheck({
      ...plain,
      text: "Activate and hold the button to confirm that you're human. Press & Hold",
    })
  ).toBe(true)
})

test("sizes from Walmart's names", () => {
  expect(sizeFromName("Great Value Whole Milk, 1 Gallon")).toBe("1 gal")
  expect(sizeFromName("Milk, Gallon")).toBe("1 gal")
  expect(sizeFromName("Chicken Breasts, 2.5 lb")).toBe("2.5 lb")
  expect(sizeFromName("Eggs, Large, 18 Count")).toBe("18 ct")
  expect(sizeFromName("Bananas, each")).toBe(null)
  expect(sizeFromName("Spinach")).toBeNull()
})

test("searches by the words", () => {
  expect(walmartSearchUrl("whole milk & eggs")).toBe(
    "https://www.walmart.com/search?q=whole%20milk%20%26%20eggs"
  )
})
