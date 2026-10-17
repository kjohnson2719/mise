import { describe, expect, test } from "vitest"
import { parseCookCommand } from "./commands.ts"
import { forSpeech } from "./speech.ts"
import { goodVoices, voiceLabel, voiceScore } from "./voices.ts"

describe("cooking commands", () => {
  test("are read with or without filler", () => {
    expect(parseCookCommand("Next")).toEqual({ kind: "next" })
    expect(parseCookCommand("okay next step please")).toEqual({ kind: "next" })
    expect(parseCookCommand("Merran, go back.")).toEqual({ kind: "back" })
    expect(parseCookCommand("say that again")).toEqual({ kind: "repeat" })
    expect(parseCookCommand("What do I need?")).toEqual({ kind: "ingredients" })
    expect(parseCookCommand("stop")).toEqual({ kind: "stop" })
    expect(parseCookCommand("I'm done")).toEqual({ kind: "done" })
    expect(parseCookCommand("start the timer")).toEqual({ kind: "stepTimer" })
  })

  test("aren't heard in talk that happens to have a command word", () => {
    expect(parseCookCommand("what's next for dinner tomorrow")).toBeNull()
    expect(parseCookCommand("I'll be back in a minute")).toBeNull()
    expect(parseCookCommand("")).toBeNull()
  })

  test("set timers, in digits or words", () => {
    const timer = (said: string) => parseCookCommand(said)
    expect(timer("set a timer for 10 minutes")).toEqual({
      kind: "timer",
      seconds: 600,
    })
    expect(timer("start a five minute timer")).toMatchObject({ seconds: 300 })
    expect(timer("timer 90 seconds")).toMatchObject({ seconds: 90 })
    expect(timer("timer for twenty five minutes")).toMatchObject({
      seconds: 1500,
    })
    expect(timer("set a timer for half an hour")).toMatchObject({
      seconds: 1800,
    })
    expect(timer("an hour timer")).toMatchObject({ seconds: 3600 })
    // A time without "timer" isn't one, and nor is a day-long one.
    expect(timer("10 minutes")).toBeNull()
    expect(timer("timer for 30 hours")).toBeNull()
  })

  test("ask how much of something", () => {
    expect(parseCookCommand("how much garlic")).toEqual({
      kind: "howMuch",
      food: "garlic",
    })
    expect(parseCookCommand("How many eggs do I need?")).toEqual({
      kind: "howMuch",
      food: "eggs",
    })
    expect(parseCookCommand("how much of the butter again")).toEqual({
      kind: "howMuch",
      food: "butter",
    })
  })

  test("fall back to English in a language without its own words yet", () => {
    expect(parseCookCommand("next", "fr-FR")).toEqual({ kind: "next" })
  })
})

describe("reading aloud", () => {
  test("says amounts and units in full", () => {
    expect(forSpeech("1 ⅓ tbsp olive oil")).toBe(
      "1 and a third tablespoons olive oil"
    )
    expect(forSpeech("½ tsp salt")).toBe("half a teaspoon salt")
    expect(forSpeech("¾ cup milk")).toBe("three quarters of a cup milk")
    expect(forSpeech("1 tbsp butter, 2 lb beef")).toBe(
      "1 tablespoon butter, 2 pounds beef"
    )
    expect(forSpeech("1 (28 oz) can tomatoes")).toBe(
      "1 (28 ounces) can tomatoes"
    )
    expect(forSpeech("4 fl oz cream")).toBe("4 fluid ounces cream")
    expect(forSpeech("500ml stock, 1 kg flour, 28 g yeast")).toBe(
      "500 milliliters stock, 1 kilogram flour, 28 grams yeast"
    )
  })

  test("says temperatures and ranges in words", () => {
    expect(forSpeech("Bake at 350°F for 5–7 minutes")).toBe(
      "Bake at 350 degrees Fahrenheit for 5 to 7 minutes"
    )
    expect(forSpeech("Heat to 180°C")).toBe("Heat to 180 degrees Celsius")
  })

  test("leaves a language it can't say in full as it is", () => {
    expect(forSpeech("1 tbsp", "fr")).toBe("1 tbsp")
  })
})

describe("choosing a voice", () => {
  const voice = (name: string, lang = "en-US", isDefault = false) => ({
    name,
    lang,
    default: isDefault,
  })
  const voices = [
    voice("Microsoft David - English (United States)", "en-US", true),
    voice("Microsoft Aria Online (Natural) - English (United States)"),
    voice("Google US English"),
    voice("Google UK English Female", "en-GB"),
    voice("Zarvox"),
    voice("Bad News"),
    voice("Ava (Premium)"),
    voice("Amélie", "fr-CA"),
  ]

  test("natural voices first, then Google's, then the rest", () => {
    expect(goodVoices(voices, "en-US").map((v) => v.name)).toEqual([
      "Ava (Premium)",
      "Microsoft Aria Online (Natural) - English (United States)",
      "Google US English",
      "Google UK English Female",
      "Microsoft David - English (United States)",
    ])
  })

  test("leaves out joke voices and other languages", () => {
    const names = goodVoices(voices, "en-US").map((v) => v.name)
    expect(names).not.toContain("Zarvox")
    expect(names).not.toContain("Bad News")
    expect(names).not.toContain("Amélie")
    expect(voiceScore(voice("Amélie", "fr-CA"), "en-US")).toBe(-1)
  })

  test("are named without the maker and language", () => {
    expect(
      voiceLabel(
        voice("Microsoft Aria Online (Natural) - English (United States)")
      )
    ).toBe("Aria Online (Natural)")
    expect(voiceLabel(voice("Google US English"))).toBe("US English")
  })
})
