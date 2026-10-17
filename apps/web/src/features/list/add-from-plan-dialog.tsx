import { addDays } from "@merran/shared"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { formatMonthDay, formatShortWeekday } from "@/features/plan/format"
import { useHouseholdClock } from "@/features/plan/queries"
import { api, ApiError, unwrap } from "@/lib/api/client"

import { fromPlanQuery, listQuery } from "./queries"

/**
 * Puts a week's planned meals on the list, those not there yet, from today
 * on, and the every-week items.
 */
export function AddFromPlanDialog({
  open,
  onOpenChange,
  week,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The week to start on; this week when not given. */
  week?: string
}) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("list.plan.title")}</DialogTitle>
          <DialogDescription>{t("list.plan.description")}</DialogDescription>
        </DialogHeader>
        {open && <AddFromPlan week={week} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function AddFromPlan({
  week: asked,
  onDone,
}: {
  week?: string
  onDone: () => void
}) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const clock = useHouseholdClock()
  const nextWeek = addDays(clock.thisWeek, 7)
  const [week, setWeek] = React.useState(asked ?? clock.thisWeek)
  // Days gone by aren't shopped for.
  const from = week < clock.today ? clock.today : week
  const to = addDays(week, 6)
  const preview = useQuery({ ...fromPlanQuery(from, to), enabled: from <= to })
  const meals = preview.data?.meals ?? []
  const groups = byDay(meals)
  const [busy, setBusy] = React.useState(false)

  async function add() {
    setBusy(true)
    try {
      const done = await unwrap(
        api.POST("/api/list/from-plan", { body: { from, to } })
      )
      await queryClient.invalidateQueries({ queryKey: listQuery.queryKey })
      const ingredients = done.added + done.merged
      const parts = [
        ingredients > 0 &&
          t("list.plan.ingredients", {
            count: ingredients,
            meals: t("list.plan.meals", { count: done.meals }),
          }),
        done.everyWeek > 0 &&
          t("list.plan.everyWeekItems", { count: done.everyWeek }),
      ].filter((part): part is string => Boolean(part))
      const what =
        parts.length === 2
          ? t("list.plan.and", { first: parts[0], second: parts[1] })
          : parts[0]
      toast.success(
        what ? t("list.plan.added", { what }) : t("list.plan.nothingNew"),
        {
          description:
            [
              done.inPantry.length > 0 &&
                t("list.plan.inPantry", { names: done.inPantry.join(", ") }),
              done.onHand.length > 0 &&
                t("list.plan.leftOff", { names: done.onHand.join(", ") }),
            ]
              .filter(Boolean)
              .join(" ") || undefined,
        }
      )
      onDone()
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-5">
      <ToggleGroup
        variant="outline"
        value={[week]}
        onValueChange={(value) => {
          if (value[0]) setWeek(value[0])
        }}
        className="w-full"
      >
        <ToggleGroupItem value={clock.thisWeek} className="flex-1">
          {t("list.plan.thisWeek")}
        </ToggleGroupItem>
        <ToggleGroupItem value={nextWeek} className="flex-1">
          {t("list.plan.nextWeek")}
        </ToggleGroupItem>
      </ToggleGroup>

      <div className="max-h-[50vh] overflow-y-auto rounded-xl bg-muted/60 p-4 text-sm">
        {preview.isPending ? (
          <p className="text-muted-foreground">{t("list.plan.checking")}</p>
        ) : meals.length > 0 ? (
          <div className="grid gap-4">
            {groups.map((group) => (
              <section key={group.key} className="grid gap-2">
                <h3 className="text-xs font-medium text-muted-foreground">
                  {group.anyDay
                    ? t("plan.pool")
                    : `${formatShortWeekday(group.date, i18n.language)} ${formatMonthDay(group.date, i18n.language)}`}
                  {" · "}
                  {t("list.plan.meals", { count: group.count })}
                </h3>
                <ul className="flex flex-wrap gap-1.5">
                  {group.recipes.map((recipe) => (
                    <li
                      key={recipe.name}
                      className="rounded-full bg-background px-2.5 py-1 font-medium"
                    >
                      {recipe.times > 1
                        ? t("list.plan.times", {
                            name: recipe.name,
                            count: recipe.times,
                          })
                        : recipe.name}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">
            {preview.data?.listed
              ? t("list.plan.allListed")
              : t("list.plan.nothingPlanned")}
          </p>
        )}
      </div>

      <Button disabled={busy || preview.isPending} onClick={() => void add()}>
        {busy && <Spinner data-icon="inline-start" />}
        {meals.length > 0
          ? t("list.plan.add", { count: meals.length })
          : t("list.plan.addEveryWeek")}
      </Button>
    </div>
  )
}

type PlannedMeal = { date: string; anyDay: boolean; name: string }

/**
 * The meals by day, the week's any-day ones first, each recipe once with
 * how many times it's planned: a long pool reads as a few lines.
 */
function byDay(meals: readonly PlannedMeal[]) {
  const groups = new Map<
    string,
    {
      key: string
      date: string
      anyDay: boolean
      count: number
      recipes: Map<string, number>
    }
  >()
  for (const meal of meals) {
    const key = meal.anyDay ? "any" : meal.date
    const group = groups.get(key) ?? {
      key,
      date: meal.date,
      anyDay: meal.anyDay,
      count: 0,
      recipes: new Map<string, number>(),
    }
    group.count++
    group.recipes.set(meal.name, (group.recipes.get(meal.name) ?? 0) + 1)
    groups.set(key, group)
  }
  return [...groups.values()]
    .sort(
      (a, b) =>
        Number(b.anyDay) - Number(a.anyDay) || a.date.localeCompare(b.date)
    )
    .map((group) => ({
      ...group,
      recipes: [...group.recipes]
        .map(([name, times]) => ({ name, times }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
}
