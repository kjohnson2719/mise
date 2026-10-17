import { DEFAULT_MEALS, MEALS, type Meal } from "@merran/shared"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { api, ApiError, unwrap } from "@/lib/api/client"

import { householdQuery } from "./queries"

/** Settings → Household → Planning: the meals filled for the household. Any can be planned by hand. */
export function PlanningCard() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data: household } = useQuery(householdQuery)
  const [meals, setMeals] = React.useState<readonly Meal[] | null>(null)
  const [busy, setBusy] = React.useState(false)
  const picked = meals ?? household?.meals ?? DEFAULT_MEALS

  async function save() {
    setBusy(true)
    try {
      queryClient.setQueryData(
        householdQuery.queryKey,
        await unwrap(
          api.PATCH("/api/households/current", { body: { meals: [...picked] } })
        )
      )
      await queryClient.invalidateQueries({ queryKey: ["plan"] })
      setMeals(null)
      toast.success(t("settings.household.planning.saved"))
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.household.planning.title")}</CardTitle>
        <CardDescription>
          {t("settings.household.planning.description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldSet>
          <FieldLegend variant="label">
            {t("settings.household.planning.meals")}
          </FieldLegend>
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            {MEALS.map((meal) => {
              const on = picked.includes(meal)
              return (
                <Field key={meal} orientation="horizontal" className="w-auto">
                  <Checkbox
                    id={`plan-meal-${meal}`}
                    checked={on}
                    // At least one: the last can't be turned off.
                    disabled={on && picked.length === 1}
                    onCheckedChange={(checked) =>
                      setMeals(
                        MEALS.filter((option) =>
                          option === meal ? checked : picked.includes(option)
                        )
                      )
                    }
                  />
                  <FieldLabel htmlFor={`plan-meal-${meal}`}>
                    {t(`plan.meals.${meal}`)}
                  </FieldLabel>
                </Field>
              )
            })}
          </div>
        </FieldSet>
      </CardContent>
      <CardFooter>
        <Button disabled={meals === null || busy} onClick={() => void save()}>
          {busy && <Spinner data-icon="inline-start" />}
          {t("settings.household.planning.save")}
        </Button>
      </CardFooter>
    </Card>
  )
}
