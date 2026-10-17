import { expect, test } from "vitest"
import { joinSections, splitSections } from "./sections.ts"

test("lines split on # headings, and join back the same", () => {
  const lines = [
    "# Dough",
    "2 cups flour",
    "1 cup water",
    "# Filling",
    "1 apple",
  ]
  const items = splitSections(lines)

  expect(items).toEqual([
    { section: "Dough", text: "2 cups flour" },
    { section: "Dough", text: "1 cup water" },
    { section: "Filling", text: "1 apple" },
  ])
  expect(joinSections(items)).toEqual(lines)
})

test("a bare # ends a section", () => {
  const lines = ["# Sauce", "1 cup cream", "#", "Salt"]

  expect(splitSections(lines)).toEqual([
    { section: "Sauce", text: "1 cup cream" },
    { section: null, text: "Salt" },
  ])
  expect(joinSections(splitSections(lines))).toEqual(lines)
})

test("blank lines are dropped", () => {
  expect(splitSections(["", "  1 egg  ", " "])).toEqual([
    { section: null, text: "1 egg" },
  ])
})

test("'For the sauce:' can count as a heading, for pasted recipes", () => {
  expect(
    splitSections(["For the sauce:", "1 cup cream"], { colonHeadings: true })
  ).toEqual([{ section: "For the sauce", text: "1 cup cream" }])
  expect(splitSections(["For the sauce:"])).toEqual([
    { section: null, text: "For the sauce:" },
  ])
})
