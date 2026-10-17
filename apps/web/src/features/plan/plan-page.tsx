import {
  ArrowLeft01Icon,
  ArrowMoveUpRightIcon,
  ArrowRight01Icon,
  Cancel01Icon,
  Delete02Icon,
  MagicWand01Icon,
  MoreHorizontalIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  costFor,
  addDays,
  dayOfWeek,
  NO_THEMES,
  weekDays,
  weekStartOf,
} from "@merran/shared"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import * as React from "react"
import { Trans, useTranslation } from "react-i18next"

import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { themesQuery } from "@/features/household/queries"
import { AddFromPlanDialog } from "@/features/list/add-from-plan-dialog"
import { SelectionBar, SelectionHeader } from "@/features/select/selection-bar"
import {
  useSelection,
  useSelectionKeepOnly,
} from "@/features/select/use-selection"

import { AddMealDialog, type Slot } from "./add-meal-dialog"
import { MoveMealsDialog } from "./change-meal-dialog"
import { averageCalories } from "./calories"
import { DayCard, PastDays, PoolCard } from "./day-card"
import { FillWeekDialog } from "./fill-week-dialog"
import { formatDay, formatWeek } from "./format"
import { NextMealCard } from "./next-meal-card"
import { NotFilledNote, useNotFilled } from "./not-filled"
import {
  planQuery,
  useHouseholdClock,
  type Meal,
  type PlanEntry,
} from "./queries"
import { usePlanActions } from "./use-plan-actions"
import { useAssistantPage } from "@/features/assistant/assistant-context"
import { formatPrice, useCosts } from "@/features/stores/queries"

/**
 * The week plan: the week to show and how full it is, what's next, the
 * week's pool of meals for any day, then each day with its meals side by
 * side.
 */
export function PlanPage({ week: asked }: { week?: string }) {
  const { t, i18n } = useTranslation()
  const clock = useHouseholdClock()
  const notFilled = useNotFilled()
  const actions = usePlanActions()
  const week = weekStartOf(asked ?? clock.today, clock.weekStartsOn)
  // The assistant knows which week is on screen.
  useAssistantPage({ week })
  const days = weekDays(week)
  const plan = useQuery(planQuery(week, addDays(week, 6)))
  const entries = plan.data?.entries ?? []
  const themes = useQuery(themesQuery).data?.themes ?? NO_THEMES
  // What the week's meals cost, where their recipes' costs are known.
  const costs = useCosts()
  const weekCost = entries.reduce<number | null>((sum, entry) => {
    const cost = entry.recipe ? costs.recipes.get(entry.recipe.id) : undefined
    if (!cost || entry.status === "skipped") return sum
    return (
      (sum ?? 0) +
      costFor(cost.total, entry.servings, entry.recipe?.servings ?? null)
    )
  }, null)
  const money = (cents: number) =>
    formatPrice(cents, costs.currency, i18n.language)
  const selection = useSelection()
  useSelectionKeepOnly(
    selection,
    entries.map((entry) => entry.id)
  )
  const [adding, setAdding] = React.useState<Slot | null>(null)
  const [moving, setMoving] = React.useState(false)
  const [filling, setFilling] = React.useState(false)
  const [listing, setListing] = React.useState(false)
  const [showPast, setShowPast] = React.useState(false)

  const thisWeek = week === clock.thisWeek
  const label = thisWeek
    ? t("plan.thisWeek")
    : week === addDays(clock.thisWeek, 7)
      ? t("plan.nextWeek")
      : week === addDays(clock.thisWeek, -7)
        ? t("plan.lastWeek")
        : null
  const range = formatWeek(week, i18n.language)
  // In this week, days gone by fold away.
  const past = thisWeek ? days.filter((day) => day < clock.today) : []
  const shownDays = showPast ? days : days.filter((day) => !past.includes(day))
  const pool = entries.filter((entry) => entry.anyDay)
  const onDay = (day: string) =>
    entries.filter((entry) => !entry.anyDay && entry.date === day)
  const average = averageCalories(days.map(onDay))
  const picked = [...selection.picked]
  // A week with days still to come can be filled.
  const fillable = days.at(-1)! >= clock.today

  const bulk = async (action: Parameters<typeof actions.bulk>[1]) => {
    if (await actions.bulk(picked, action)) selection.done()
  }

  return (
    <>
      <PageHeader
        title={t("plan.title")}
        description={[
          label ? t("plan.weekLabel", { label, range }) : range,
          average &&
            t("plan.caloriesADay", {
              count: average,
              value: average.toLocaleString(i18n.language),
            }),
          weekCost !== null &&
            (costs.weeklyBudget !== null
              ? t("plan.weekCostOf", {
                  cost: money(weekCost),
                  budget: money(costs.weeklyBudget),
                })
              : t("plan.weekCost", { cost: money(weekCost) })),
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          selection.selecting ? (
            <SelectionHeader
              selection={selection}
              allIds={entries.map((entry) => entry.id)}
            />
          ) : (
            <div className="flex gap-2">
              {fillable && (
                <Button variant="outline" onClick={() => setFilling(true)}>
                  <HugeiconsIcon
                    icon={MagicWand01Icon}
                    strokeWidth={2}
                    data-icon="inline-start"
                  />
                  {t("plan.fill.button")}
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label={t("plan.more")}
                    />
                  }
                >
                  <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem
                    disabled={entries.length === 0}
                    onClick={() => selection.start()}
                  >
                    {t("plan.selectMeals")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void actions.repeat(week)}>
                    {t("plan.repeat")}
                  </DropdownMenuItem>
                  {fillable && (
                    <DropdownMenuItem onClick={() => setListing(true)}>
                      {t("plan.addToList")}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => void actions.clear(week)}
                  >
                    {thisWeek ? t("plan.clear") : t("plan.clearWeek")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        }
      />

      <div className="grid gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="rounded-full"
              aria-label={t("plan.previous")}
              render={<Link to="/plan" search={{ week: addDays(week, -7) }} />}
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
            </Button>
            <span className="min-w-28 text-center font-semibold">{range}</span>
            <Button
              variant="outline"
              size="icon"
              className="rounded-full"
              aria-label={t("plan.following")}
              render={<Link to="/plan" search={{ week: addDays(week, 7) }} />}
            >
              <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
            </Button>
            {!thisWeek && (
              <Button variant="ghost" size="sm" render={<Link to="/plan" />}>
                {t("plan.toThisWeek")}
              </Button>
            )}
          </div>
          {plan.data && (
            <div className="flex flex-wrap items-center gap-2">
              <NotFilledNote meals={notFilled} />
              <WeekSummary
                entries={entries}
                meals={clock.meals}
                days={days.length}
              />
            </div>
          )}
        </div>

        {thisWeek && !selection.selecting && <NextMealCard />}

        {plan.isPending ? (
          <div className="grid gap-4">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-36 rounded-3xl" />
            ))}
          </div>
        ) : (
          <>
            <PoolCard
              entries={pool}
              selection={selection}
              onAdd={() =>
                setAdding({
                  date: week,
                  meal: clock.meals.includes("dinner")
                    ? "dinner"
                    : clock.meals[0]!,
                  anyDay: true,
                  label: t("plan.pool"),
                })
              }
            />
            {past.length > 0 && (
              <PastDays
                days={past}
                entries={entries.filter(
                  (entry) => !entry.anyDay && past.includes(entry.date)
                )}
                open={showPast}
                onToggle={() => setShowPast((open) => !open)}
              />
            )}
            {shownDays.map((day) => (
              <DayCard
                key={day}
                day={day}
                today={clock.today}
                theme={themes[dayOfWeek(day)] ?? null}
                entries={onDay(day)}
                selection={selection}
                onAdd={(meal) =>
                  setAdding({
                    date: day,
                    meal,
                    anyDay: false,
                    label: `${formatDay(day, i18n.language)} · ${t(`plan.meals.${meal}`)}`,
                  })
                }
              />
            ))}
          </>
        )}
      </div>

      <AddMealDialog
        slot={adding}
        onOpenChange={(open) => {
          if (!open) setAdding(null)
        }}
      />
      <AddFromPlanDialog open={listing} onOpenChange={setListing} week={week} />
      <FillWeekDialog
        open={filling}
        onOpenChange={setFilling}
        days={days}
        entries={entries}
        themes={themes}
      />
      {moving && (
        <MoveMealsDialog
          ids={picked}
          week={week}
          open={moving}
          onOpenChange={setMoving}
          onMoved={selection.done}
        />
      )}
      <SelectionBar
        selection={selection}
        actions={[
          {
            label: t("plan.bulk.move"),
            icon: ArrowMoveUpRightIcon,
            onSelect: () => setMoving(true),
          },
          {
            label: t("plan.bulk.cooked"),
            icon: Tick02Icon,
            onSelect: () => void bulk({ action: "status", status: "cooked" }),
          },
          {
            label: t("plan.bulk.skipped"),
            icon: Cancel01Icon,
            onSelect: () => void bulk({ action: "status", status: "skipped" }),
          },
          {
            label: t("plan.bulk.remove"),
            icon: Delete02Icon,
            destructive: true,
            onSelect: () => void bulk({ action: "remove" }),
          },
        ]}
      />
    </>
  )
}

/** How full the week is: days' meals planned, of the ones there are to plan. */
function WeekSummary({
  entries,
  meals,
  days,
}: {
  entries: PlanEntry[]
  meals: readonly Meal[]
  days: number
}) {
  const filled = new Set(
    entries
      .filter((entry) => !entry.anyDay && meals.includes(entry.meal))
      .map((entry) => `${entry.date} ${entry.meal}`)
  ).size
  return (
    <span className="rounded-full bg-secondary px-3 py-1 text-sm">
      <Trans
        i18nKey="plan.filled"
        values={{ filled, total: meals.length * days }}
        components={{ b: <strong className="font-semibold" /> }}
      />
    </span>
  )
}
