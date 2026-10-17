import { describe, expect, test } from "vitest"
import { firstDuration, splitDurations } from "./durations.ts"
import { foodWords, ingredientsInStep } from "./step-ingredients.ts"

describe("times in a step", () => {
  test("are split out with their length in seconds", () => {
    expect(splitDurations("Bake 25 minutes, then rest 30 secs.")).toEqual([
      { type: "text", text: "Bake " },
      { type: "duration", text: "25 minutes", seconds: 1500, upTo: null },
      { type: "text", text: ", then rest " },
      { type: "duration", text: "30 secs", seconds: 30, upTo: null },
      { type: "text", text: "." },
    ])
  })

  test("start a range at the low end, and keep its high end", () => {
    expect(firstDuration("Simmer 5–7 min until thick")).toEqual({
      type: "duration",
      text: "5–7 min",
      seconds: 300,
      upTo: 420,
    })
    expect(firstDuration("Roast for 10 to 12 mins")).toMatchObject({
      seconds: 600,
      upTo: 720,
    })
  })

  test("read halves, decimals and hours", () => {
    expect(firstDuration("Braise 1½ hours")?.seconds).toBe(5400)
    expect(firstDuration("Chill 1.5 hrs")?.seconds).toBe(5400)
    expect(firstDuration("Rest ½ hour")?.seconds).toBe(1800)
    expect(firstDuration("Cook 2 hours")?.seconds).toBe(7200)
  })

  test("read a minute, an hour and half an hour in words", () => {
    expect(firstDuration("Stir for a minute.")).toEqual({
      type: "duration",
      text: "a minute",
      seconds: 60,
      upTo: null,
    })
    expect(firstDuration("Simmer for an hour, stirring")?.seconds).toBe(3600)
    expect(firstDuration("Rest for half an hour")).toEqual({
      type: "duration",
      text: "half an hour",
      seconds: 1800,
      upTo: null,
    })
    expect(firstDuration("Cook a few minutes, in a pan")).toBeUndefined()
  })

  test("leave a step without one as it is", () => {
    const step = "Season to taste and serve at 2 o'clock."
    expect(splitDurations(step)).toEqual([{ type: "text", text: step }])
    expect(firstDuration(step)).toBeUndefined()
    expect(splitDurations("Bake 0 minutes")).toEqual([
      { type: "text", text: "Bake 0 minutes" },
    ])
  })
})

describe("ingredients in a step", () => {
  const ingredients = [
    { id: "garlic", food: "garlic cloves" },
    { id: "oil", food: "olive oil" },
    { id: "tomatoes", food: "can chopped tomatoes" },
    { id: "onion", food: "red onion" },
    { id: "seasoning", food: "Salt and pepper" },
    { id: "unknown", food: null },
  ]

  test("are found by the words a step uses for them", () => {
    expect(
      ingredientsInStep(
        "Heat the oil, then add the onion and a clove of garlic.",
        ingredients
      )
    ).toEqual(new Set(["oil", "onion", "garlic"]))
    expect(ingredientsInStep("Tip in the tomato.", ingredients)).toEqual(
      new Set(["tomatoes"])
    )
    expect(ingredientsInStep("Season with salt.", ingredients)).toEqual(
      new Set(["seasoning"])
    )
  })

  test("aren't found from words that only describe them", () => {
    expect(
      ingredientsInStep("You can add red wine if you like.", ingredients)
    ).toEqual(new Set())
    expect(foodWords("large fresh eggs")).toEqual(["eggs", "egg"])
  })
})
