import { displayIngredient, type UnitSystem } from "@merran/shared"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { NeedsAi, useAiFor } from "@/features/ai/needs-ai"
import { api, ApiError, unwrap } from "@/lib/api/client"

import { recipeQuery, useRefreshRecipes, type Recipe } from "../queries"
import type { Swap, SwapThisTime } from "./this-time"

type Line = Recipe["ingredients"][number]

/**
 * Stand-ins for one of a recipe's ingredients, for someone who's out of it
 * or doesn't eat it: used for this time, or saved to the recipe.
 */
export function SwapDialog({
  recipe,
  line,
  factor,
  system,
  onUse,
  onUndo,
  onOpenChange,
}: {
  recipe: Recipe
  /** The line to swap; the dialog shows while there is one. */
  line: Line | null
  /** The scale it's being made at, for the stand-ins' amounts. */
  factor: number
  system: UnitSystem
  onUse: (swap: SwapThisTime) => void
  /** Stops using a stand-in this time. */
  onUndo: (ingredientId: string) => void
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const ai = useAiFor("swaps")
  const queryClient = useQueryClient()
  const refresh = useRefreshRecipes()
  const [saving, setSaving] = React.useState<number | null>(null)
  const swaps = useQuery({
    queryKey: ["stand-ins", recipe.id, recipe.updatedAt, line?.id],
    queryFn: () =>
      unwrap(
        api.POST("/api/recipes/{recipe}/stand-ins", {
          params: { path: { recipe: recipe.id } },
          body: { ingredientId: line!.id },
        })
      ),
    enabled: Boolean(line) && ai.ready === true,
    staleTime: Infinity,
    retry: false,
  })

  async function save(swap: Swap, index: number) {
    if (!line) return
    setSaving(index)
    try {
      const { recipe: saved, undoVersionId } = await unwrap(
        api.POST("/api/recipes/{recipe}/swap", {
          params: { path: { recipe: recipe.id } },
          body: { ingredientId: line.id, lines: swap.lines, steps: swap.steps },
        })
      )
      queryClient.setQueryData(recipeQuery(saved.slug).queryKey, saved)
      await refresh()
      onOpenChange(false)
      toast.success(t("recipes.swaps.saved"), {
        action: undoVersionId
          ? {
              label: t("recipes.swaps.undo"),
              onClick: () => void undo(undoVersionId),
            }
          : undefined,
      })
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    } finally {
      setSaving(null)
    }
  }

  async function undo(versionId: string) {
    try {
      const restored = await unwrap(
        api.POST("/api/recipes/{recipe}/versions/{versionId}/restore", {
          params: { path: { recipe: recipe.id, versionId } },
        })
      )
      queryClient.setQueryData(recipeQuery(restored.slug).queryKey, restored)
      await refresh()
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    }
  }

  const shown = (text: string) => {
    const { amount, rest } = displayIngredient(text, { factor, system })
    return `${amount}${rest}`
  }

  return (
    <Dialog open={line !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t("recipes.swaps.title", { line: line ? shown(line.text) : "" })}
          </DialogTitle>
          <DialogDescription>
            {t("recipes.swaps.description")}
          </DialogDescription>
        </DialogHeader>

        {ai.why ? (
          <NeedsAi
            task="swaps"
            why={ai.why}
            onNavigate={() => onOpenChange(false)}
          />
        ) : swaps.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {swaps.error instanceof ApiError
              ? swaps.error.message
              : t("status.error.description")}
          </p>
        ) : !swaps.data ? (
          <div className="grid gap-3" aria-busy>
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {t("recipes.swaps.finding")}
            </p>
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-24 rounded-2xl" />
            ))}
          </div>
        ) : swaps.data.swaps.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("recipes.swaps.none")}
          </p>
        ) : (
          <ul className="grid gap-3">
            {swaps.data.swaps.map((swap, index) => (
              <li
                key={index}
                className="grid gap-3 rounded-2xl border bg-card p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <ul className="grid gap-0.5 font-medium">
                    {swap.lines.map((text) => (
                      <li key={text}>{shown(text)}</li>
                    ))}
                  </ul>
                  {swap.atHome && (
                    <Badge variant="secondary">
                      {t("recipes.swaps.atHome")}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{swap.note}</p>
                {swap.steps.length > 0 && (
                  <div className="grid gap-1 rounded-xl bg-muted px-3 py-2 text-sm">
                    <p className="font-medium">
                      {t("recipes.swaps.changesSteps", {
                        count: swap.steps.length,
                      })}
                    </p>
                    {swap.steps.map((step) => (
                      <p key={step.stepId}>{step.text}</p>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={saving !== null}
                    onClick={() => void save(swap, index)}
                  >
                    {saving === index && <Spinner data-icon="inline-start" />}
                    {t("recipes.swaps.save")}
                  </Button>
                  <Button
                    size="sm"
                    disabled={saving !== null}
                    onClick={() => {
                      if (!line) return
                      onUse({
                        ...swap,
                        ingredientId: line.id,
                        insteadOf: line.text,
                      })
                      onOpenChange(false)
                      toast.success(
                        t("recipes.swaps.using", {
                          lines: swap.lines.map(shown).join(", "),
                        }),
                        {
                          action: {
                            label: t("recipes.swaps.undo"),
                            onClick: () => onUndo(line.id),
                          },
                        }
                      )
                    }}
                  >
                    {t("recipes.swaps.use")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
