import { describe, expect, test } from "vitest"
import {
  judgeSale,
  saleNudge,
  usualPrice,
  worthSaying,
  type PriceSeen,
} from "./deals.ts"
import type { StoreProduct } from "./products.ts"

const TODAY = "2026-10-16"

const product = (price: number, salePrice: number | null): StoreProduct => ({
  id: "1",
  upc: null,
  name: "Chicken thighs",
  brand: null,
  size: "1 lb",
  image: null,
  price,
  salePrice,
  saleEnds: null,
  currency: "USD",
  aisle: null,
  inStock: true,
  url: null,
})

const seen = (
  rows: [day: string, price: number, salePrice?: number][]
): PriceSeen[] =>
  rows.map(([day, price, salePrice]) => ({
    day,
    price,
    salePrice: salePrice ?? null,
  }))

describe("what a product usually costs", () => {
  test("its most common regular price over 90 days", () => {
    expect(
      usualPrice(
        seen([
          ["2026-09-01", 449],
          ["2026-09-08", 449],
          ["2026-09-15", 499],
          ["2026-10-01", 449],
          // Too long ago to count.
          ["2026-05-01", 399],
          ["2026-05-02", 399],
          ["2026-05-03", 399],
          ["2026-05-04", 399],
        ]),
        TODAY
      )
    ).toBe(449)
  })

  test("nothing until it's been seen on a few days, two weeks apart", () => {
    expect(
      usualPrice(
        seen([
          ["2026-10-10", 449],
          ["2026-10-12", 449],
          ["2026-10-14", 449],
        ]),
        TODAY
      )
    ).toBeNull()
    expect(
      usualPrice(
        seen([
          ["2026-09-01", 449],
          ["2026-10-14", 449],
        ]),
        TODAY
      )
    ).toBeNull()
  })

  test("a tie goes to the more recent price", () => {
    expect(
      usualPrice(
        seen([
          ["2026-09-01", 399],
          ["2026-09-10", 399],
          ["2026-09-20", 449],
          ["2026-10-10", 449],
        ]),
        TODAY
      )
    ).toBe(449)
  })
})

describe("judging a sale", () => {
  const history = seen([
    ["2026-08-20", 499],
    ["2026-09-01", 499, 399],
    ["2026-09-15", 499],
    ["2026-10-01", 499],
  ])

  test("isn't one without a sale price under the regular one", () => {
    expect(judgeSale(product(499, null), history, TODAY)).toBeNull()
    expect(judgeSale(product(499, 549), history, TODAY)).toBeNull()
  })

  test("the lowest it's been in a while", () => {
    expect(judgeSale(product(499, 349), history, TODAY)).toEqual({
      verdict: "lowest",
      usual: 499,
      off: (499 - 349) / 499,
    })
  })

  test("a normal sale, when it's been as low before", () => {
    expect(judgeSale(product(499, 429), history, TODAY)?.verdict).toBe("sale")
  })

  test("barely off what it usually costs", () => {
    // Regular price raised to 549 for the sale: 479 is under a tenth off
    // the usual 499.
    expect(judgeSale(product(549, 479), history, TODAY)).toMatchObject({
      verdict: "small",
      usual: 499,
    })
  })

  test("without enough history, a sale against its regular price", () => {
    expect(judgeSale(product(499, 349), [], TODAY)).toMatchObject({
      verdict: "sale",
      usual: 499,
    })
  })
})

describe("leaning on sales", () => {
  const chicken = { aisle: "meat-seafood" as const, verdict: "sale" as const }
  const spinach = { aisle: "produce" as const, verdict: "sale" as const }

  test("meat counts most, and the lean says how much", () => {
    expect(saleNudge([chicken], "off")).toBe(0)
    expect(saleNudge([chicken], "some")).toBe(1)
    expect(saleNudge([chicken], "lots")).toBe(2.5)
    expect(saleNudge([spinach], "some")).toBeCloseTo(0.4)
  })

  test("barely-off sales count for nothing, and it's capped", () => {
    expect(saleNudge([{ ...chicken, verdict: "small" }], "lots")).toBe(0)
    expect(saleNudge([chicken, chicken, chicken], "some")).toBe(1.5)
    expect(saleNudge([chicken, chicken, chicken], "lots")).toBe(4)
  })

  test("only sales that change dinner are given as a reason", () => {
    expect(worthSaying(chicken)).toBe(true)
    expect(worthSaying(spinach)).toBe(true)
    const flour = { aisle: "pantry" as const, verdict: "sale" as const }
    expect(worthSaying(flour)).toBe(false)
    expect(worthSaying({ ...flour, verdict: "lowest" })).toBe(true)
    expect(worthSaying({ ...chicken, verdict: "small" })).toBe(false)
  })

  test("the lowest in a while counts for more", () => {
    expect(saleNudge([{ ...chicken, verdict: "lowest" }], "some")).toBe(1.5)
  })
})
