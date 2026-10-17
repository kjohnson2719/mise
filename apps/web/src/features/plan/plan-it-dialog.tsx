import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldGroup } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"

import { MealField, WhenField } from "./fields"
import { useHouseholdClock, type Meal } from "./queries"
import { usePlanActions } from "./use-plan-actions"
import { parseWhen } from "./when"

/**
 * Putting the recipe on the plan from its page, as it's shown there: its
 * servings and the side it's shown with.
 */
export function PlanItDialog({
  recipe,
  servings,
  withRecipe,
  open,
  onOpenChange,
}: {
  recipe: { id: string; name: string }
  /** The servings shown, when they aren't the recipe's own. */
  servings: number | null
  withRecipe: { id: string } | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const clock = useHouseholdClock()
  const actions = usePlanActions()
  const [when, setWhen] = React.useState(clock.today)
  const [meal, setMeal] = React.useState<string>(
    clock.meals.includes("dinner") ? "dinner" : clock.meals[0]!
  )
  const [busy, setBusy] = React.useState(false)

  async function plan() {
    const to = parseWhen(when)
    setBusy(true)
    const added = await actions.add({
      date: to.date,
      anyDay: to.anyDay,
      meal: meal as Meal,
      recipe: recipe.id,
      withRecipe: withRecipe?.id ?? null,
      servings,
    })
    setBusy(false)
    if (!added) return
    toast.success(t("plan.planned", { name: recipe.name }))
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("plan.planItTitle", { name: recipe.name })}
          </DialogTitle>
        </DialogHeader>
        <FieldGroup>
          <WhenField week={clock.thisWeek} value={when} onChange={setWhen} />
          <MealField value={meal} onChange={setMeal} />
        </FieldGroup>
        <DialogFooter>
          <Button disabled={busy} onClick={() => void plan()}>
            {busy && <Spinner data-icon="inline-start" />}
            {t("plan.planIt")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
