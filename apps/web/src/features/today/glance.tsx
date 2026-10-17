import { addDays, firstOpenMeal } from "@merran/shared"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import { listQuery } from "@/features/list/queries"
import { pantryQuery } from "@/features/pantry/queries"
import { missedMeal, urgency, useDayLabel } from "@/features/pantry/use-soon"
import { formatWeekday } from "@/features/plan/format"
import { useHouseholdClock, type PlanEntry } from "@/features/plan/queries"
import { cn } from "@/lib/utils"

type Tile = {
  to: "/plan" | "/list" | "/pantry"
  label: string
  value: string
  detail: string
  warn?: boolean
}

/**
 * The week, the list and the pantry at a glance, each a tile that opens
 * its page: how much of the week is planned and the first open meal, how
 * much there is to buy, and what to use soon.
 */
export function Glance({ entries }: { entries: PlanEntry[] }) {
  const { t, i18n } = useTranslation()
  const clock = useHouseholdClock()
  const list = useQuery(listQuery)
  const pantry = useQuery(pantryQuery)
  const dayLabel = useDayLabel()
  const names = new Intl.ListFormat(i18n.language, { type: "conjunction" })

  const weekEnd = addDays(clock.thisWeek, 6)
  const week = entries.filter(
    (entry) =>
      entry.date >= clock.thisWeek &&
      entry.date <= weekEnd &&
      clock.meals.includes(entry.meal)
  )
  const filled = new Set(week.map((entry) => `${entry.date} ${entry.meal}`))
  const open = firstOpenMeal(week, { ...clock, meals: clock.meals })

  const left = (list.data?.items ?? []).filter((item) => !item.checked)

  const soon = (pantry.data?.items ?? [])
    .filter((item) => item.useSoon)
    .sort((a, b) => urgency(a.useSoon!) - urgency(b.useSoon!))
  const first = soon[0]
  const when = (() => {
    const use = first?.useSoon
    if (!first || !use) return ""
    if (use.kind === "past") return t("pantry.tags.past")
    if (use.kind === "soon")
      return t("pantry.tags.useBy", { day: dayLabel(use.date, true) })
    const missed = missedMeal(first, clock.today)
    return missed
      ? t("pantry.soon.boughtFor", { name: missed.name })
      : t("pantry.soon.leftoverWhen")
  })()

  const tiles: Tile[] = [
    {
      to: "/plan",
      label: t("today.tiles.week"),
      value: t("today.tiles.planned", {
        filled: filled.size,
        total: clock.meals.length * 7,
      }),
      detail: open
        ? t("today.tiles.open", {
            day: formatWeekday(open.date, i18n.language),
            meal: t(`plan.meals.${open.meal}`).toLowerCase(),
          })
        : t("today.tiles.allPlanned"),
    },
    {
      to: "/list",
      label: t("today.tiles.shopping"),
      value:
        left.length > 0
          ? t("today.tiles.toBuy", { count: left.length })
          : t("today.tiles.nothingToBuy"),
      detail:
        left.length > 0
          ? names.format(left.slice(0, 3).map((item) => item.name))
          : t("today.tiles.fromPlan"),
    },
    ...(first
      ? [
          {
            to: "/pantry" as const,
            label: t("today.tiles.useSoon"),
            value: first.name,
            detail:
              soon.length > 1
                ? t("today.tiles.andMore", { when, count: soon.length - 1 })
                : when,
            warn: true,
          },
        ]
      : []),
  ]

  return (
    <div className="grid gap-3 sm:auto-cols-fr sm:grid-flow-col">
      {tiles.map((tile) => (
        <Link
          key={tile.to}
          to={tile.to}
          className={cn(
            "grid content-start gap-1 rounded-3xl border bg-card p-5 text-card-foreground transition-colors outline-none hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/50",
            tile.warn && "border-amber-500/30 bg-amber-500/[0.07]"
          )}
        >
          <span
            className={cn(
              "text-xs font-semibold tracking-wide text-muted-foreground uppercase",
              tile.warn && "text-amber-700 dark:text-amber-400"
            )}
          >
            {tile.label}
          </span>
          <span className="inline-block font-heading text-2xl font-semibold first-letter:uppercase">
            {tile.value}
          </span>
          <span className="truncate text-sm text-muted-foreground">
            {tile.detail}
          </span>
        </Link>
      ))}
    </div>
  )
}
