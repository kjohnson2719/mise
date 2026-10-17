import { NUTRIENT_KEYS, NUTRIENT_UNITS, type NutrientKey } from "@merran/shared"
import { useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useCapability } from "@/features/capabilities/queries"
import { api, ApiError, unwrap } from "@/lib/api/client"

import { recipeQuery, type Recipe } from "./queries"

/**
 * What a serving has: calories, protein and the rest, where it came from,
 * and the lines that couldn't be counted. Worked out by itself after a
 * save; this can do it again.
 */
export function NutritionSection({ recipe }: { recipe: Recipe }) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const usda = useCapability("nutrition")
  const ai = useCapability("ai")
  const [busy, setBusy] = React.useState(false)
  const nutrition = recipe.nutrition
  const canWorkOut = usda || ai
  if (!nutrition && !canWorkOut) return null

  const number = new Intl.NumberFormat(i18n.language, {
    maximumFractionDigits: 1,
  })
  const shown = NUTRIENT_KEYS.flatMap((key) => {
    const value = nutrition?.[key as NutrientKey]
    return typeof value === "number" ? [{ key, value }] : []
  })

  async function workOut() {
    setBusy(true)
    try {
      const updated = await unwrap(
        api.POST("/api/recipes/{recipe}/nutrition", {
          params: { path: { recipe: recipe.id } },
        })
      )
      queryClient.setQueryData(recipeQuery(updated.slug).queryKey, updated)
      toast.success(t("recipes.nutrition.workedOut"))
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">
          {t("recipes.nutrition.title")}
        </h2>
        {canWorkOut && recipe.servings && (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => void workOut()}
          >
            {busy && <Spinner data-icon="inline-start" />}
            {nutrition
              ? t("recipes.nutrition.again")
              : t("recipes.nutrition.workOut")}
          </Button>
        )}
      </div>
      {nutrition && shown.length > 0 ? (
        <>
          <dl className="grid grid-cols-4 gap-2 sm:grid-cols-7">
            {shown.map(({ key, value }) => (
              <div
                key={key}
                className="grid gap-0.5 rounded-2xl bg-muted px-2 py-2.5 text-center"
              >
                <dt className="text-xs text-muted-foreground">
                  {t(`recipes.nutrition.nutrients.${key}`)}
                </dt>
                <dd className="font-semibold tabular-nums">
                  {number.format(value)}
                  {NUTRIENT_UNITS[key] !== "kcal" && (
                    <span className="text-xs font-normal text-muted-foreground">
                      {" "}
                      {NUTRIENT_UNITS[key]}
                    </span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-sm text-muted-foreground">
            {t(`recipes.nutrition.source.${nutrition.source}`)}
          </p>
          {nutrition.missing && nutrition.missing.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {t("recipes.nutrition.missing", {
                lines: nutrition.missing.join(", "),
              })}
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          {recipe.servings
            ? t("recipes.nutrition.notYet")
            : t("recipes.nutrition.needsServings")}
        </p>
      )}
    </section>
  )
}
