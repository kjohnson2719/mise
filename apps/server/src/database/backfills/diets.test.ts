import { expect, test } from "vitest"
import { backfillDiets } from "./diets.ts"

test("recipes saved before diet labels get them, corrections and all", async () => {
  const updates: unknown[][] = []
  await backfillDiets(async (sql, params) => {
    if (sql.startsWith("select id")) {
      return [
        { id: "soup", diet_overrides: null },
        { id: "chili", diet_overrides: '{"gluten-free":false}' },
        { id: "toast", diet_overrides: { vegan: true } },
        { id: "empty", diet_overrides: null },
      ]
    }
    if (sql.startsWith("select recipe_id")) {
      return [
        { recipe_id: "soup", raw_text: "1 cup vegetable broth" },
        { recipe_id: "chili", raw_text: "1 lb ground beef" },
        { recipe_id: "toast", raw_text: "2 slices bread" },
        { recipe_id: "toast", raw_text: "1 tbsp butter" },
      ]
    }
    updates.push(params ?? [])
    return []
  })

  expect(updates).toEqual([
    [",vegetarian,vegan,gluten-free,dairy-free,egg-free,nut-free,", "soup"],
    [",dairy-free,egg-free,nut-free,", "chili"],
    [",vegetarian,vegan,egg-free,nut-free,", "toast"],
  ])
})
