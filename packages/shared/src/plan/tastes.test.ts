import { describe, expect, test } from "vitest"
import {
  avoidedIn,
  canLeaveOut,
  checkTastes,
  leftOutLines,
  levelOf,
  missingDiets,
  type AvoidedFood,
} from "./tastes.ts"

const avoided = (
  food: string,
  level: AvoidedFood["level"] = "never",
  who: string | null = null
): AvoidedFood => ({ food, level, who })

const mushroom = avoided("mushroom")
const nuts = avoided("nuts", "allergy")

describe("avoided foods", () => {
  test("match a food in its other forms", () => {
    expect(avoidedIn(["8 oz mushrooms, sliced"], [mushroom])).toEqual([
      mushroom,
    ])
    const berry = avoided("berry")
    expect(avoidedIn(["1 cup mixed berries"], [berry])).toEqual([berry])
    expect(avoidedIn(["2 cups rice"], [mushroom])).toEqual([])
  })

  test("match whole words only", () => {
    const pea = avoided("pea")
    expect(avoidedIn(["1 peach, sliced"], [pea])).toEqual([])
    expect(avoidedIn(["1 cup frozen peas"], [pea])).toEqual([pea])
  })

  test("use the diet labels' careful check for nuts, dairy and the like", () => {
    // Pesto has nuts, though the word isn't there.
    expect(avoidedIn(["1/2 cup pesto"], [nuts])).toEqual([nuts])
    const dairy = avoided("Dairy")
    expect(avoidedIn(["2 tbsp butter"], [dairy])).toEqual([dairy])
    expect(avoidedIn(["2 tbsp olive oil"], [dairy])).toEqual([])
  })

  test("trust the recipe's labels when given, corrections and all", () => {
    expect(avoidedIn(["1/2 cup pesto"], [nuts], ["nut-free"])).toEqual([])
  })

  test("are none when there's nothing to avoid or no ingredients", () => {
    expect(avoidedIn(["1 cup pesto"], [])).toEqual([])
    expect(avoidedIn([], [nuts])).toEqual([])
  })
})

describe("a recipe Merran can't read", () => {
  // Pistachio baklava, kept in Arabic: nuts, butter and sugar, which it
  // can't see.
  const baklava = {
    name: "بقلاوة بالفستق",
    lines: ["250 غرام فستق حلبي مطحون", "200 غرام زبدة مذابة", "1 كوب سكر"],
  }
  const peanuts = avoided("peanuts", "allergy", "Emma")
  const dairy = avoided("dairy")

  test("may have any allergy, even with labels that say otherwise", () => {
    expect(avoidedIn(baklava.lines, [nuts, peanuts])).toEqual([nuts, peanuts])
    expect(avoidedIn(baklava.lines, [nuts], ["nut-free"])).toEqual([nuts])
    expect(checkTastes(baklava, [nuts, peanuts])).toEqual({
      ruledOut: [nuts, peanuts],
      leaveOut: [],
      needed: [],
      unchecked: [nuts, peanuts],
    })
  })

  test("counts dislikes only where they're found, and by its labels", () => {
    // It has no labels, so it may have dairy; mushrooms it would have to find.
    expect(avoidedIn(baklava.lines, [mushroom, dairy])).toEqual([dairy])
    expect(checkTastes(baklava, [mushroom, dairy])).toMatchObject({
      ruledOut: [dairy],
      unchecked: [dairy],
    })
    const emma = avoided("mushroom", "leave-out", "Emma")
    expect(checkTastes(baklava, [emma]).leaveOut).toEqual([])
  })

  test("is only one mostly in another script", () => {
    // A word or two in another script is fine.
    const rice = ["2 cups rice", "1 tbsp 味醂 (mirin)", "salt"]
    expect(avoidedIn(rice, [nuts, peanuts])).toEqual([])
    expect(checkTastes({ name: "Rice", lines: rice }, [nuts])).toEqual({
      ruledOut: [],
      leaveOut: [],
      needed: [],
      unchecked: [],
    })
  })
})

describe("leaving a food out", () => {
  const stirFry = {
    name: "Chicken Stir Fry",
    lines: [
      "1 lb chicken thighs",
      "8 oz mushrooms, sliced",
      "2 tbsp soy sauce",
      "1 cup button mushrooms",
    ],
  }
  const emma = avoided("mushroom", "leave-out", "Emma")

  test("crosses off its lines, saying who it's for", () => {
    expect(checkTastes(stirFry, [emma])).toEqual({
      ruledOut: [],
      leaveOut: [{ food: "mushroom", who: "Emma", lines: [1, 3], swap: false }],
      needed: [],
      unchecked: [],
    })
    expect(leftOutLines(stirFry, [emma])).toEqual(new Set([1, 3]))
  })

  test("rules out a recipe that's named for it", () => {
    const risotto = {
      name: "Mushroom Risotto",
      lines: ["1 cup arborio rice", "8 oz mushrooms"],
    }
    expect(checkTastes(risotto, [emma])).toEqual({
      ruledOut: [emma],
      leaveOut: [],
      needed: [{ food: "mushroom", who: "Emma", by: "name" }],
      unchecked: [],
    })
    expect(leftOutLines(risotto, [emma])).toEqual(new Set())
  })

  test("rules out a recipe the household said needs it", () => {
    expect(
      checkTastes({ ...stirFry, needs: ["mushrooms"] }, [emma])
    ).toMatchObject({
      ruledOut: [emma],
      leaveOut: [],
      needed: [{ food: "mushroom", by: "household" }],
    })
    // Needing something else changes nothing.
    expect(
      checkTastes({ ...stirFry, needs: ["chicken"] }, [emma]).leaveOut
    ).toHaveLength(1)
  })

  test("never for allergies, or for what's never eaten", () => {
    const allergy = avoided("mushroom", "allergy", "Sam")
    expect(checkTastes(stirFry, [allergy])).toEqual({
      ruledOut: [allergy],
      leaveOut: [],
      needed: [],
      unchecked: [],
    })
    expect(checkTastes(stirFry, [mushroom]).ruledOut).toEqual([mushroom])
  })

  test("never for nuts, dairy, gluten, eggs or meat, which are in too much", () => {
    expect(canLeaveOut("mushrooms")).toBe(true)
    for (const food of ["nuts", "Dairy", "gluten", "eggs", "meat"])
      expect(canLeaveOut(food)).toBe(false)
    const dairy = avoided("dairy", "leave-out")
    expect(levelOf(dairy)).toBe("never")
    expect(
      checkTastes({ name: "Mac and Cheese", lines: ["2 cups cheddar"] }, [
        dairy,
      ])
    ).toEqual({ ruledOut: [dairy], leaveOut: [], needed: [], unchecked: [] })
  })

  test("takes each food on its own", () => {
    const olives = avoided("olive", "leave-out")
    const salad = {
      name: "Greek Salad",
      lines: ["1 cucumber", "1/2 cup kalamata olives", "4 oz mushrooms"],
    }
    expect(checkTastes(salad, [emma, olives, nuts])).toEqual({
      ruledOut: [],
      leaveOut: [
        { food: "mushroom", who: "Emma", lines: [2], swap: false },
        { food: "olive", who: null, lines: [1], swap: false },
      ],
      needed: [],
      unchecked: [],
    })
  })
})

describe("leaving a food out, once tidy up has marked the lines", () => {
  const emma = avoided("mushroom", "leave-out", "Emma")
  const risotto = {
    name: "Mushroom Risotto",
    lines: ["1 cup arborio rice", "8 oz mushrooms", "parsley, to serve"],
  }

  test("goes by the marks, not the name", () => {
    // Marked optional, the mushrooms come out even though it's named for them.
    expect(
      checkTastes({ ...risotto, marks: ["needed", "optional", "optional"] }, [
        emma,
      ])
    ).toMatchObject({ ruledOut: [], leaveOut: [{ lines: [1], swap: false }] })
    // Marked needed, it's ruled out, and says why.
    expect(
      checkTastes({ ...risotto, marks: ["needed", "needed", "optional"] }, [
        emma,
      ])
    ).toMatchObject({
      ruledOut: [emma],
      needed: [{ food: "mushroom", by: "mark" }],
    })
  })

  test("says when another food could stand in", () => {
    const stirFry = {
      name: "Chicken Stir Fry",
      lines: ["1 lb chicken", "8 oz mushrooms"],
      marks: ["needed", "swappable"] as const,
    }
    expect(checkTastes(stirFry, [emma]).leaveOut).toEqual([
      { food: "mushroom", who: "Emma", lines: [1], swap: true },
    ])
  })

  test("still lets the household's word win", () => {
    expect(
      checkTastes(
        {
          ...risotto,
          marks: ["needed", "optional", "optional"],
          needs: ["mushrooms"],
        },
        [emma]
      ).needed
    ).toEqual([{ food: "mushroom", who: "Emma", by: "household" }])
  })

  test("leaves unmarked recipes as they were", () => {
    expect(
      checkTastes({ ...risotto, marks: [null, null, null] }, [emma]).needed
    ).toEqual([{ food: "mushroom", who: "Emma", by: "name" }])
  })
})

describe("diets every meal must fit", () => {
  test("say which a recipe misses", () => {
    expect(missingDiets(["vegetarian"], ["vegetarian", "nut-free"])).toEqual([
      "nut-free",
    ])
    expect(missingDiets(["vegan", "vegetarian"], ["vegetarian"])).toEqual([])
    expect(missingDiets([], [])).toEqual([])
  })
})
