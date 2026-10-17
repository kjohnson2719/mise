import { weekStartOf } from "@merran/shared"
import * as React from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { RecipePicker } from "@/features/recipes/recipe-picker"

import { MealField, WhenField } from "./fields"
import { useHouseholdClock, type Meal, type PlanEntry } from "./queries"
import { usePlanActions } from "./use-plan-actions"
import { parseWhen, whenValue } from "./when"

/** Moving a meal, or changing its servings, side or note. */
export function ChangeMealDialog({
  entry,
  open,
  onOpenChange,
}: {
  entry: PlanEntry
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const clock = useHouseholdClock()
  const actions = usePlanActions()
  const [when, setWhen] = React.useState(whenValue(entry))
  const [meal, setMeal] = React.useState<string>(entry.meal)
  const [servings, setServings] = React.useState(
    entry.servings == null ? "" : String(entry.servings)
  )
  const [note, setNote] = React.useState(entry.note ?? "")
  const [side, setSide] = React.useState(entry.withRecipe)
  const [pickingSide, setPickingSide] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  async function save() {
    const changes: Parameters<typeof actions.change>[1] = {}
    const moved = parseWhen(when)
    if (when !== whenValue(entry)) {
      changes.date = moved.date
      changes.anyDay = moved.anyDay
    }
    if (meal !== entry.meal) changes.meal = meal as Meal
    if (entry.recipe) {
      const wanted = servings.trim() ? Number(servings) : null
      if (wanted !== entry.servings) changes.servings = wanted
      if ((side?.id ?? null) !== (entry.withRecipe?.id ?? null)) {
        changes.withRecipe = side?.id ?? null
      }
    } else if (note.trim() && note.trim() !== entry.note) {
      changes.note = note.trim()
    }
    if (Object.keys(changes).length === 0) {
      onOpenChange(false)
      return
    }
    setBusy(true)
    const changed = await actions.change(entry, changes)
    setBusy(false)
    if (changed) onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("plan.change")}</DialogTitle>
        </DialogHeader>
        {pickingSide ? (
          <div className="grid min-w-0 gap-3">
            <RecipePicker
              label={t("plan.pickSide")}
              exclude={entry.recipe ? [entry.recipe.id] : []}
              onPick={(recipe) => {
                setSide({
                  id: recipe.id,
                  slug: recipe.slug,
                  name: recipe.name,
                  calories: null,
                })
                setPickingSide(false)
              }}
            />
            <Button
              variant="ghost"
              className="justify-self-start"
              onClick={() => setPickingSide(false)}
            >
              {t("common.cancel")}
            </Button>
          </div>
        ) : (
          <form
            className="grid gap-6"
            onSubmit={(event) => {
              event.preventDefault()
              void save()
            }}
          >
            <FieldGroup>
              <WhenField
                week={weekStartOf(entry.date, clock.weekStartsOn)}
                value={when}
                onChange={setWhen}
              />
              <MealField value={meal} onChange={setMeal} />
              {entry.recipe ? (
                <>
                  <Field>
                    <FieldLabel htmlFor="plan-servings">
                      {t("plan.servings")}
                    </FieldLabel>
                    <Input
                      id="plan-servings"
                      type="number"
                      inputMode="decimal"
                      min={0.25}
                      step="any"
                      placeholder={
                        entry.recipe.servings == null
                          ? undefined
                          : String(entry.recipe.servings)
                      }
                      value={servings}
                      onChange={(event) => setServings(event.target.value)}
                    />
                    {entry.recipe.servings != null && (
                      <FieldDescription>
                        {t("plan.servingsHint", {
                          count: entry.recipe.servings,
                        })}
                      </FieldDescription>
                    )}
                  </Field>
                  <Field>
                    <FieldLabel>{t("plan.side")}</FieldLabel>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {side?.name ?? t("plan.noSide")}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setPickingSide(true)}
                      >
                        {t("plan.pickSide")}
                      </Button>
                      {side && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setSide(null)}
                        >
                          {t("plan.noSide")}
                        </Button>
                      )}
                    </div>
                  </Field>
                </>
              ) : (
                <Field>
                  <FieldLabel htmlFor="plan-note">{t("plan.note")}</FieldLabel>
                  <Input
                    id="plan-note"
                    maxLength={200}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </Field>
              )}
            </FieldGroup>
            <DialogFooter>
              <Button type="submit" disabled={busy}>
                {busy && <Spinner data-icon="inline-start" />}
                {t("plan.save")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Moving several meals: to a day or a week's pool, and a meal or each its own. */
export function MoveMealsDialog({
  ids,
  week,
  open,
  onOpenChange,
  onMoved,
}: {
  ids: string[]
  week: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onMoved: () => void
}) {
  const { t } = useTranslation()
  const actions = usePlanActions()
  const [when, setWhen] = React.useState(`any:${week}`)
  const [meal, setMeal] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  async function move() {
    const to = parseWhen(when)
    setBusy(true)
    const moved = await actions.bulk(ids, {
      action: "move",
      date: to.date,
      anyDay: to.anyDay,
      ...(meal ? { meal: meal as Meal } : {}),
    })
    setBusy(false)
    if (moved) {
      onOpenChange(false)
      onMoved()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("plan.moveTo")}</DialogTitle>
        </DialogHeader>
        <FieldGroup>
          <WhenField week={week} value={when} onChange={setWhen} />
          <MealField value={meal} onChange={setMeal} keepOwn />
        </FieldGroup>
        <DialogFooter>
          <Button disabled={busy} onClick={() => void move()}>
            {busy && <Spinner data-icon="inline-start" />}
            {t("plan.bulk.move")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
