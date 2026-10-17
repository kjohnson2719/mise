import {
  checkTastes,
  namesFood,
  type AvoidedFood,
  type TasteCheck,
} from "@merran/shared"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { tastesQuery } from "@/features/household/queries"
import { api, ApiError, unwrap } from "@/lib/api/client"

import { recipeQuery, useRefreshRecipes, type Recipe } from "./queries"

/** A line left out, and who for. */
export type LeftOutLine = { food: string; who: string | null }

export type RecipeTastes = TasteCheck & {
  /** The lines to leave out, by id. */
  lines: ReadonlyMap<string, LeftOutLine>
}

const NONE: RecipeTastes = {
  ruledOut: [],
  leaveOut: [],
  needed: [],
  unchecked: [],
  lines: new Map(),
}

/**
 * What the household's tastes make of a recipe: the lines to leave out for
 * someone who doesn't like them, and the foods that keep it from being
 * suggested.
 */
export function useRecipeTastes(recipe: Recipe | undefined): RecipeTastes {
  const { data } = useQuery(tastesQuery)
  return React.useMemo(() => {
    if (!recipe || !data || data.avoid.length === 0) return NONE
    const avoid: AvoidedFood[] = data.avoid.map((item) => ({
      ...item,
      who: item.who ?? null,
    }))
    const check = checkTastes(
      {
        name: recipe.name,
        lines: recipe.ingredients.map((line) => line.text),
        marks: recipe.ingredients.map((line) => line.mark),
        diets: recipe.diets,
        needs: recipe.needs,
      },
      avoid
    )
    const lines = new Map<string, LeftOutLine>()
    for (const item of check.leaveOut) {
      for (const index of item.lines) {
        const line = recipe.ingredients[index]
        if (line) lines.set(line.id, { food: item.food, who: item.who })
      }
    }
    return { ...check, lines }
  }, [recipe, data])
}

/** The lines to leave out of a recipe and the one it's cooked with. */
export function mergeLeftOut(...all: RecipeTastes[]) {
  return new Map(all.flatMap((tastes) => [...tastes.lines]))
}

/**
 * Says a recipe can't do without a food, or can after all: a dislike in it
 * then rules it out, or is left out again.
 */
export function useSetNeeds(recipe: Recipe) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const refresh = useRefreshRecipes()
  const [saving, setSaving] = React.useState(false)

  async function setNeeds(
    foods: string[],
    message: string,
    canLeaveOut?: string[]
  ) {
    setSaving(true)
    try {
      queryClient.setQueryData(
        recipeQuery(recipe.slug).queryKey,
        await unwrap(
          api.PUT("/api/recipes/{recipe}/needs", {
            params: { path: { recipe: recipe.id } },
            body: { foods, ...(canLeaveOut ? { canLeaveOut } : {}) },
          })
        )
      )
      await refresh()
      toast.success(message)
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      toast.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  return {
    saving,
    need: (food: string) =>
      setNeeds(
        [...recipe.needs, food],
        t("recipes.tastes.neededSaved", { food })
      ),
    // Whether the household said so or tidy up marked it.
    leaveOut: (food: string) =>
      setNeeds(
        recipe.needs.filter((need) => !namesFood(need, food)),
        t("recipes.tastes.leaveOutSaved", { food }),
        [food]
      ),
  }
}
