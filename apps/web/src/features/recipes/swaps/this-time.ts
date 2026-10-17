import { parseIngredient, swapNames } from "@merran/shared"
import * as React from "react"

import type { Schemas } from "@/lib/api/client"

import type { Recipe } from "../queries"

// Swaps for this time: a stand-in used for cooking a recipe once, without
// changing it. Kept for the tab, so it carries from the recipe to cooking
// it, and cleared when cooking's done or the recipe is left.

export type Swap = Schemas["Swap"]

/** A stand-in in use: which line it's for, and what that line said. */
export type SwapThisTime = Swap & { ingredientId: string; insteadOf: string }

const key = (recipeId: string) => `merran:swaps:${recipeId}`
const listeners = new Set<() => void>()
const cache = new Map<string, SwapThisTime[]>()
const NONE: SwapThisTime[] = []

function read(recipeId: string): SwapThisTime[] {
  const cached = cache.get(recipeId)
  if (cached) return cached
  let swaps = NONE
  try {
    const stored = sessionStorage.getItem(key(recipeId))
    if (stored) swaps = JSON.parse(stored) as SwapThisTime[]
  } catch {
    // Storage off, or something odd in it: no swaps.
  }
  cache.set(recipeId, swaps)
  return swaps
}

function write(recipeId: string, swaps: SwapThisTime[]) {
  cache.set(recipeId, swaps.length ? swaps : NONE)
  try {
    if (swaps.length)
      sessionStorage.setItem(key(recipeId), JSON.stringify(swaps))
    else sessionStorage.removeItem(key(recipeId))
  } catch {
    // Kept for this page only, then.
  }
  for (const listener of listeners) listener()
}

/** Forgets a recipe's swaps: cooking's done, or the recipe was left. */
export const clearSwaps = (recipeId: string) => write(recipeId, [])

/** A recipe's swaps for this time, and using or undoing one. */
export function useSwapsThisTime(recipeId: string) {
  const swaps = React.useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => read(recipeId),
    () => NONE
  )
  return {
    swaps,
    use: (swap: SwapThisTime) =>
      write(recipeId, [
        ...read(recipeId).filter((s) => s.ingredientId !== swap.ingredientId),
        swap,
      ]),
    undo: (ingredientId: string) =>
      write(
        recipeId,
        read(recipeId).filter((s) => s.ingredientId !== ingredientId)
      ),
  }
}

/** A line made from a swap's stand-in: what a swapped line says now. */
export type SwappedLine = { ingredientId: string; insteadOf: string }

/**
 * How a swap changed a step: rewritten for it (with what it said before),
 * or with the stand-in named where the ingredient was.
 */
export type SwappedStep = {
  /** What it said before, when the stand-in rewrote it. */
  original: string | null
  /** Names put in it, to mark. */
  names: string[]
}

/** What a stand-in's called in a step: "tomato sauce", "milk and lemon juice". */
function standInName(lines: readonly string[]) {
  return lines
    .slice(0, 2)
    .map((line) => {
      const parsed = parseIngredient(line)
      return parsed.food ?? parsed.text
    })
    .join(" and ")
}

/**
 * A recipe as it's cooked this time: each swapped line replaced by its
 * stand-in's lines (parsed, so they scale), and its steps following the
 * swap: rewritten where the stand-in changes how it's made, and naming the
 * stand-in where they named the ingredient. Says which lines and steps
 * changed.
 */
export function withSwaps(recipe: Recipe, swaps: readonly SwapThisTime[]) {
  const lines = new Map<string, SwappedLine>()
  const steps = new Map<string, SwappedStep>()
  if (swaps.length === 0) return { recipe, lines, steps }

  const bySwap = new Map(swaps.map((swap) => [swap.ingredientId, swap]))
  const rewritten = new Map(
    swaps.flatMap((swap) => swap.steps.map((s) => [s.stepId, s.text] as const))
  )
  const ingredients = recipe.ingredients.flatMap((line) => {
    const swap = bySwap.get(line.id)
    if (!swap) return [line]
    return swap.lines.map((text, index) => {
      const parsed = parseIngredient(text)
      const id = `${line.id}:swap:${index}`
      lines.set(id, { ingredientId: line.id, insteadOf: swap.insteadOf })
      return {
        ...line,
        id,
        text: parsed.text,
        quantity: parsed.quantity,
        quantityMax: parsed.quantityMax,
        unit: parsed.unitId,
        food: parsed.food,
        note: parsed.note,
      }
    })
  })

  // What each swap renames, and the foods that keep their names.
  const renames = recipe.ingredients.flatMap((line) => {
    const swap = bySwap.get(line.id)
    return swap && line.food
      ? [{ from: line.food, to: standInName(swap.lines) }]
      : []
  })
  const others = recipe.ingredients
    .filter((line) => !bySwap.has(line.id))
    .flatMap((line) => (line.food ? [line.food] : []))

  return {
    recipe: {
      ...recipe,
      ingredients,
      steps: recipe.steps.map((step) => {
        const text = rewritten.get(step.id)
        if (text !== undefined) {
          steps.set(step.id, {
            original: step.text,
            names: renames.map((rename) => rename.to),
          })
          return { ...step, text }
        }
        let renamed = step.text
        const names: string[] = []
        for (const rename of renames) {
          const result = swapNames(renamed, { ...rename, others })
          if (!result.swapped) continue
          renamed = result.text
          names.push(rename.to)
        }
        if (names.length === 0) return step
        steps.set(step.id, { original: null, names })
        return { ...step, text: renamed }
      }),
    },
    lines,
    steps,
  }
}
