import { LeafIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  dietConflicts,
  DIETS,
  dietsFor,
  type Diet,
  type DietOverrides,
} from "@merran/shared"
import { useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { api, ApiError, unwrap } from "@/lib/api/client"

import { recipeQuery, useRefreshRecipes, type Recipe } from "./queries"

/** The recipe's diet labels, each a link to recipes like it, and a way to correct them. */
export function DietBadges({
  recipe,
  diets = recipe.diets,
  onCorrect,
}: {
  recipe: Recipe
  /** Labels for the recipe with what it goes with, which can't be corrected here. */
  diets?: readonly Diet[]
  onCorrect: () => void
}) {
  const { t } = useTranslation()
  const own = diets === recipe.diets
  if (diets.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <HugeiconsIcon
        icon={LeafIcon}
        strokeWidth={2}
        className="size-4 text-primary"
        aria-hidden
      />
      {diets.map((diet) => (
        <Badge
          key={diet}
          variant="outline"
          render={<Link to="/recipes" search={{ diets: diet }} />}
        >
          {t(`recipes.diets.names.${diet}`)}
        </Badge>
      ))}
      {own && (
        <Button
          variant="link"
          size="sm"
          className="h-auto px-1 text-xs text-muted-foreground"
          onClick={onCorrect}
        >
          {t("recipes.diets.notRight")}
        </Button>
      )}
    </div>
  )
}

/** Corrects the labels. Only what differs from the ingredients is kept. */
export function DietDialog({
  recipe,
  open,
  onOpenChange,
}: {
  recipe: Recipe
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("recipes.diets.label")}</DialogTitle>
          <DialogDescription>
            {t("recipes.diets.description")}
          </DialogDescription>
        </DialogHeader>
        {open && (
          <DietForm recipe={recipe} onDone={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function DietForm({ recipe, onDone }: { recipe: Recipe; onDone: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const refresh = useRefreshRecipes()
  const lines = recipe.ingredients.map((line) => line.text)
  const suggested = dietsFor(lines)
  const conflicts = dietConflicts(lines)
  const [checked, setChecked] = React.useState<ReadonlySet<Diet>>(
    () => new Set(recipe.diets)
  )
  const [saving, setSaving] = React.useState(false)

  const overrides: DietOverrides = {}
  for (const diet of DIETS) {
    if (checked.has(diet) !== suggested.includes(diet)) {
      overrides[diet] = checked.has(diet)
    }
  }
  const corrected = Object.keys(recipe.dietOverrides).length > 0

  async function save(next: DietOverrides) {
    setSaving(true)
    try {
      queryClient.setQueryData(
        recipeQuery(recipe.slug).queryKey,
        await unwrap(
          api.PUT("/api/recipes/{recipe}/diets", {
            params: { path: { recipe: recipe.id } },
            body: { overrides: next },
          })
        )
      )
      await refresh()
      toast.success(t("recipes.diets.saved"))
      onDone()
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      toast.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  /** "2 tbsp butter; 1 cup cream and 2 more". */
  const listOf = (found: string[]) => {
    const shown = found.slice(0, 2).join("; ")
    return found.length > 2
      ? t("recipes.diets.andMore", { lines: shown, count: found.length - 2 })
      : shown
  }

  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        void save(overrides)
      }}
    >
      <ul className="grid gap-3">
        {DIETS.map((diet) => {
          const id = `diet-${diet}`
          const changed = diet in overrides
          const against = conflicts[diet]
          return (
            <li key={diet} className="flex items-start gap-3">
              <Checkbox
                id={id}
                className="mt-0.5"
                checked={checked.has(diet)}
                onCheckedChange={(on) =>
                  setChecked((current) => {
                    const next = new Set(current)
                    if (on) next.add(diet)
                    else next.delete(diet)
                    return next
                  })
                }
              />
              <div className="grid gap-0.5">
                <Label htmlFor={id}>{t(`recipes.diets.names.${diet}`)}</Label>
                <span className="text-xs text-muted-foreground">
                  {against.length > 0
                    ? changed
                      ? t("recipes.diets.setDespite", {
                          lines: listOf(against),
                        })
                      : t("recipes.diets.ruledOut", { lines: listOf(against) })
                    : changed
                      ? t("recipes.diets.set")
                      : t("recipes.diets.fits")}
                </span>
              </div>
            </li>
          )
        })}
      </ul>
      <p className="text-xs text-muted-foreground">
        {t("recipes.diets.caution")}
      </p>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        {corrected ? (
          <Button
            type="button"
            variant="ghost"
            disabled={saving}
            onClick={() => void save({})}
          >
            {t("recipes.diets.automatic")}
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" disabled={saving}>
          {saving && <Spinner data-icon="inline-start" />}
          {t("recipes.diets.save")}
        </Button>
      </div>
    </form>
  )
}
