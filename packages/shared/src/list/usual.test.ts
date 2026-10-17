import { describe, expect, test } from "vitest"
import { usualBuys, type PurchaseRecord } from "./usual.ts"

const bought = (
  food: string,
  boughtOn: string,
  more: Partial<PurchaseRecord> = {}
): PurchaseRecord => ({
  food,
  name: food,
  boughtOn,
  quantity: null,
  unit: null,
  amountText: null,
  ...more,
})

describe("usual buys", () => {
  test("are what's bought on three days or more, about how far apart", () => {
    const usual = usualBuys([
      bought("milk", "2026-09-27"),
      bought("milk", "2026-10-03"),
      bought("milk", "2026-10-09", { quantity: 1, unit: "gallon" }),
      // Twice isn't usual yet.
      bought("saffron", "2026-08-01"),
      bought("saffron", "2026-10-01"),
    ])
    expect(usual).toEqual([
      {
        food: "milk",
        name: "milk",
        amount: "1 gal",
        every: 6,
        lastBought: "2026-10-09",
        // A little before the six days are up.
        dueOn: "2026-10-14",
      },
    ])
  })

  test("count each day once, however many times it's bought that day", () => {
    const [eggs] = usualBuys([
      bought("eggs", "2026-10-01"),
      bought("eggs", "2026-10-01"),
      bought("eggs", "2026-10-08"),
      bought("eggs", "2026-10-15", { amountText: "a dozen" }),
      bought("eggs", "2026-10-15", { amountText: "18" }),
    ])
    expect(eggs?.every).toBe(7)
    // As it was bought last.
    expect(eggs?.amount).toBe("18")
  })

  test("go by the usual gap, not an odd one", () => {
    const [bread] = usualBuys([
      bought("bread", "2026-09-01"),
      bought("bread", "2026-09-05"),
      bought("bread", "2026-09-09"),
      // Away for a month.
      bought("bread", "2026-10-09"),
      bought("bread", "2026-10-13"),
    ])
    expect(bread?.every).toBe(4)
  })

  test("leave out what's bought months apart", () => {
    expect(
      usualBuys([
        bought("turkey", "2024-11-20"),
        bought("turkey", "2025-11-22"),
        bought("turkey", "2026-11-21"),
      ])
    ).toEqual([])
  })

  test("come most overdue first", () => {
    const usual = usualBuys([
      bought("milk", "2026-10-01"),
      bought("milk", "2026-10-05"),
      bought("milk", "2026-10-09"),
      bought("coffee", "2026-08-01"),
      bought("coffee", "2026-08-31"),
      bought("coffee", "2026-09-30"),
    ])
    expect(usual.map((buy) => [buy.food, buy.dueOn])).toEqual([
      ["milk", "2026-10-12"],
      ["coffee", "2026-10-26"],
    ])
  })
})
