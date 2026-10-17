import { describe, expect, test } from "vitest"
import { asLink, plainText, readMinutes, stars, tagList } from "./text.ts"

describe("other apps' text", () => {
  test("times are read as minutes, however they're written", () => {
    expect(readMinutes("1 hour 30 minutes")).toBe(90)
    expect(readMinutes("1 hr 30 mins")).toBe(90)
    expect(readMinutes("PT1H30M")).toBe(90)
    expect(readMinutes("45 min")).toBe(45)
    expect(readMinutes("1.5 hours")).toBe(90)
    expect(readMinutes("1 day")).toBe(1440)
    expect(readMinutes("90")).toBe(90)
    expect(readMinutes("a while")).toBeNull()
    expect(readMinutes("")).toBeNull()
  })

  test("text keeps its lines and paragraphs, not its markup", () => {
    expect(plainText("<b>One</b>  line\r\nTwo\u2028Three\n\n\n\nFour ")).toBe(
      "One line\nTwo\nThree\n\nFour"
    )
  })

  test("only web links are links", () => {
    expect(asLink(" https://example.com/soup ")).toBe(
      "https://example.com/soup"
    )
    expect(asLink("javascript:alert(1)")).toBeNull()
    expect(asLink("NYT Cooking")).toBeNull()
  })

  test("ratings are 1 to 5 stars, and 0 is none", () => {
    expect(stars(4.5)).toBe(5)
    expect(stars(9)).toBe(5)
    expect(stars(0)).toBeNull()
  })

  test("tags come once each, short enough", () => {
    expect(tagList(["Soup", "soup", " Dinner ", "x".repeat(41), ""])).toEqual([
      "Soup",
      "Dinner",
    ])
  })
})
