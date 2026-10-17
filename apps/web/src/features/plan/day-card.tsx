import { Add01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { MEALS, themeLabel, type NightTheme } from "@merran/shared"
import * as React from "react"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { Selection } from "@/features/select/use-selection"
import { cn } from "@/lib/utils"

import { formatMonthDay, formatShortWeekday, formatWeekday } from "./format"
import { dayCalories } from "./calories"
import { MealTile } from "./meal-tile"
import { NotFilledIcon, useNotFilled } from "./not-filled"
import type { Meal, PlanEntry } from "./queries"

/** The frame every part of the week sits in. */
const FRAME =
  "@container grid gap-3.5 rounded-3xl border bg-card p-5 text-card-foreground md:px-6"

/** A small heading over a meal's dishes: "DINNER", with an (i) if it isn't filled for you. */
function MealLabel({
  meal,
  notFilled,
  hideNarrow = false,
}: {
  meal: Meal
  notFilled: boolean
  hideNarrow?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div
      className={cn(
        "flex h-6 items-center gap-0.5",
        hideNarrow && "hidden @2xl:flex"
      )}
    >
      <p className="text-xs leading-6 font-semibold tracking-wide text-muted-foreground uppercase">
        {t(`plan.meals.${meal}`)}
      </p>
      {notFilled && <NotFilledIcon meal={meal} />}
    </div>
  )
}

/**
 * One day of the plan, full width, with every meal side by side when there's
 * room: the ones the household doesn't plan on its own can still be planned
 * by hand. An empty meal is a "+ Add lunch" box in its place; on a narrow
 * card they shrink to small buttons after what's planned.
 */
export function DayCard({
  day,
  today,
  theme,
  entries,
  selection,
  onAdd,
}: {
  day: string
  today: string
  /** Dinner's theme that night. */
  theme: NightTheme | null
  entries: PlanEntry[]
  selection: Selection
  onAdd: (meal: Meal) => void
}) {
  const { t, i18n } = useTranslation()
  const id = React.useId()
  const byMeal = new Map<Meal, PlanEntry[]>()
  for (const entry of entries) {
    byMeal.set(entry.meal, [...(byMeal.get(entry.meal) ?? []), entry])
  }
  const isToday = day === today
  const notFilled = useNotFilled()
  const calories = dayCalories(entries)

  return (
    <section
      aria-labelledby={id}
      className={cn(
        FRAME,
        isToday && "border-primary ring-1 ring-primary",
        day < today && "opacity-75"
      )}
    >
      <header className="flex items-baseline gap-2.5">
        <h2 id={id} className="text-xl font-semibold tracking-tight">
          {formatWeekday(day, i18n.language)}
        </h2>
        <span className="text-sm text-muted-foreground">
          {formatMonthDay(day, i18n.language)}
        </span>
        {isToday && <Badge className="self-center">{t("plan.today")}</Badge>}
        {theme && (
          <Badge variant="secondary" className="self-center">
            {themeLabel(theme)}
          </Badge>
        )}
        {calories && (
          <span className="ml-auto text-sm text-muted-foreground tabular-nums">
            {t(calories.partial ? "plan.caloriesMore" : "plan.calories", {
              count: calories.total,
              value: calories.total.toLocaleString(i18n.language),
            })}
          </span>
        )}
      </header>

      <div
        className="flex flex-wrap gap-2 @2xl:grid @2xl:grid-cols-(--meal-columns) @2xl:gap-3"
        style={
          {
            "--meal-columns": `repeat(${MEALS.length}, minmax(0, 1fr))`,
          } as React.CSSProperties
        }
      >
        {MEALS.map((meal) =>
          byMeal.has(meal) ? (
            <div key={meal} className="grid basis-full content-start gap-1.5">
              <div className="flex h-6 items-center justify-between">
                <MealLabel meal={meal} notFilled={notFilled.includes(meal)} />
                {!selection.selecting && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t(`plan.add.${meal}`)}
                    onClick={() => onAdd(meal)}
                  >
                    <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
                  </Button>
                )}
              </div>
              <ul className="grid gap-1.5">
                {byMeal.get(meal)!.map((entry) => (
                  <MealTile
                    key={entry.id}
                    entry={entry}
                    selection={selection}
                  />
                ))}
              </ul>
            </div>
          ) : (
            <div
              key={meal}
              className="order-last grid content-start gap-1.5 @2xl:order-none"
            >
              <MealLabel
                meal={meal}
                notFilled={notFilled.includes(meal)}
                hideNarrow
              />
              <Button
                variant="outline"
                size="sm"
                disabled={selection.selecting}
                className="rounded-full border-dashed bg-transparent text-muted-foreground @2xl:h-17 @2xl:w-full @2xl:rounded-2xl"
                onClick={() => onAdd(meal)}
              >
                <HugeiconsIcon
                  icon={Add01Icon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                <span className="@2xl:hidden">{t(`plan.meals.${meal}`)}</span>
                <span className="hidden @2xl:inline">
                  {t(`plan.add.${meal}`)}
                </span>
              </Button>
            </div>
          )
        )}
      </div>
    </section>
  )
}

/** The week's pool: meals for the week without a day yet. */
export function PoolCard({
  entries,
  selection,
  onAdd,
}: {
  entries: PlanEntry[]
  selection: Selection
  onAdd: () => void
}) {
  const { t } = useTranslation()
  const id = React.useId()
  return (
    <section aria-labelledby={id} className={FRAME}>
      <header className="grid gap-0.5">
        <h2 id={id} className="text-xl font-semibold tracking-tight">
          {t("plan.pool")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("plan.poolHint")}</p>
      </header>
      <ul className="grid gap-1.5 @2xl:grid-cols-2 @2xl:gap-3 @4xl:grid-cols-3">
        {entries.map((entry) => (
          <MealTile key={entry.id} entry={entry} selection={selection} />
        ))}
        {!selection.selecting && (
          <li>
            <Button
              variant="outline"
              className="h-17 w-full rounded-2xl border-dashed bg-transparent text-muted-foreground"
              onClick={onAdd}
            >
              <HugeiconsIcon
                icon={Add01Icon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              {t("plan.addToPool")}
            </Button>
          </li>
        )}
      </ul>
    </section>
  )
}

/** This week's days gone by, folded into one line until they're wanted. */
export function PastDays({
  days,
  entries,
  open,
  onToggle,
}: {
  days: string[]
  entries: PlanEntry[]
  open: boolean
  onToggle: () => void
}) {
  const { t, i18n } = useTranslation()
  const day = (date: string) => formatShortWeekday(date, i18n.language)
  const range =
    days.length > 1 ? `${day(days[0]!)} – ${day(days.at(-1)!)}` : day(days[0]!)
  const cooked = entries.filter((entry) => entry.status === "cooked")
  const summary = cooked.length
    ? t("plan.pastCooked", {
        count: cooked.length,
        names: cooked
          .map((entry) => entry.recipe?.name ?? entry.note)
          .join(", "),
      })
    : entries.length
      ? t("plan.pastPlanned", { count: entries.length })
      : t("plan.pastNothing")

  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className="flex items-center justify-between gap-4 rounded-3xl border bg-muted/40 px-5 py-3.5 text-left transition-colors outline-none hover:bg-muted/70 focus-visible:ring-[3px] focus-visible:ring-ring/50 md:px-6"
    >
      <span className="min-w-0 truncate text-muted-foreground">
        <span className="font-semibold text-foreground">{range}</span> ·{" "}
        {summary}
      </span>
      <span className="shrink-0 text-sm font-semibold text-primary">
        {open ? t("plan.hide") : t("plan.show")}
      </span>
    </button>
  )
}
