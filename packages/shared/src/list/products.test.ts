import { describe, expect, test } from "vitest"
import {
  packagesFor,
  priceNow,
  readProductSize,
  type StoreProduct,
} from "./products.ts"

describe("a product's size", () => {
  test("reads weights, volumes and counts", () => {
    expect(readProductSize("1 gal")).toEqual([
      { kind: "volume", amount: 3785.41 },
    ])
    expect(readProductSize("3 lb bag")).toEqual([
      { kind: "weight", amount: 3 * 453.592 },
    ])
    expect(readProductSize("6 ct / 12 fl oz").map((one) => one.kind)).toEqual([
      "count",
      "volume",
    ])
    expect(readProductSize("500 g")).toEqual([{ kind: "weight", amount: 500 }])
    expect(readProductSize("")).toEqual([])
    expect(readProductSize(null)).toEqual([])
  })
})

describe("how many to buy", () => {
  test("whole packages for a weight or volume", () => {
    expect(packagesFor({ quantity: 2, unit: "pound" }, "1 lb")).toEqual({
      packages: 2,
      sure: true,
    })
    // A little over one pack is still one.
    expect(packagesFor({ quantity: 1.05, unit: "pound" }, "1 lb")).toEqual({
      packages: 1,
      sure: true,
    })
    expect(packagesFor({ quantity: 300, unit: "milliliter" }, "1 gal")).toEqual(
      { packages: 1, sure: true }
    )
  })

  test("counts from a box, or one at a time", () => {
    expect(packagesFor({ quantity: 3, unit: null }, "12 ct")).toEqual({
      packages: 1,
      sure: true,
    })
    expect(packagesFor({ quantity: 2, unit: null }, null)).toEqual({
      packages: 2,
      sure: false,
    })
  })

  test("so many of something sold by weight, by what one weighs", () => {
    // 13 carrots at 70 g are 910 g: two 1 lb bags, not thirteen.
    expect(packagesFor({ quantity: 13, unit: null }, "1 lb", "carrot")).toEqual(
      {
        packages: 2,
        sure: false,
      }
    )
    // Garlic by the head, ten cloves to one.
    expect(
      packagesFor({ quantity: 67, unit: "clove" }, null, "garlic")
    ).toEqual({
      packages: 7,
      sure: false,
    })
    expect(
      packagesFor({ quantity: 67, unit: "clove" }, "3 ct", "garlic")
    ).toEqual({
      packages: 3,
      sure: true,
    })
    // Without knowing what one weighs, one at a time.
    expect(packagesFor({ quantity: 3, unit: null }, "1 lb", "leek")).toEqual({
      packages: 3,
      sure: false,
    })
  })

  test("one, unsure, when the size says something else", () => {
    expect(packagesFor({ quantity: 2, unit: "cup" }, "1 lb")).toEqual({
      packages: 1,
      sure: false,
    })
    expect(packagesFor({ quantity: null, unit: null }, "1 lb")).toEqual({
      packages: 1,
      sure: true,
    })
  })
})

describe("a product's price", () => {
  const milk: StoreProduct = {
    id: "1",
    upc: "1",
    name: "Milk",
    brand: null,
    size: "1 gal",
    image: null,
    price: 429,
    salePrice: 349,
    saleEnds: "2026-10-20",
    currency: "USD",
    aisle: null,
    inStock: true,
    url: null,
  }

  test("is the sale's until it ends", () => {
    expect(priceNow(milk, "2026-10-20")).toEqual({
      price: 349,
      regular: 429,
      onSale: true,
    })
    expect(priceNow(milk, "2026-10-21")).toEqual({
      price: 429,
      regular: 429,
      onSale: false,
    })
  })
})
