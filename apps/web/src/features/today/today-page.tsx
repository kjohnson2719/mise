import { addDays, MEALS, nextMeal, wantsTonightIdea } from "@merran/shared"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import * as React from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { AiLimitNote } from "@/features/ai/household-ai-card"
import { useMe } from "@/features/auth/use-me"
import { InstallBanner } from "@/features/install/install-ui"
import { listQuery } from "@/features/list/queries"
import { pantryQuery } from "@/features/pantry/queries"
import { Fact, MealHero } from "@/features/plan/next-meal-card"
import {
  planQuery,
  useHouseholdClock,
  type PlanEntry,
} from "@/features/plan/queries"

import { AlsoToday } from "./also-today"
import { AutoplanNote } from "./autoplan-note"
import { ComingUp } from "./coming-up"
import { Glance } from "./glance"
import { recentRecipesQuery } from "./queries"
import { Shelves } from "./shelves"
import { TonightIdea } from "./tonight-idea"
import { Welcome } from "./welcome"

/** In a day's order: by meal, then as placed. */
const inOrder = (a: PlanEntry, b: PlanEntry) =>
  a.date.localeCompare(b.date) ||
  MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal) ||
  a.position - b.position

/** Checks the time each minute, so what's next moves on as the day does. */
function useMinute() {
  const [, tick] = React.useReducer((n: number) => n + 1, 0)
  React.useEffect(() => {
    const timer = setInterval(tick, 60_000)
    return () => clearInterval(timer)
  }, [])
}

/**
 * Today, the home page: what's next (or an idea for tonight), the week,
 * the list and the pantry at a glance, the days coming up, and recipes to
 * cook again. A new household gets three steps to start instead.
 */
export function TodayPage() {
  const { t, i18n } = useTranslation()
  const me = useMe()
  useMinute()
  const clock = useHouseholdClock()
  const plan = useQuery(planQuery(clock.thisWeek, addDays(clock.today, 7)))
  const recent = useQuery(recentRecipesQuery)

  const greeting =
    clock.hour < 5 || clock.hour >= 17
      ? "evening"
      : clock.hour < 12
        ? "morning"
        : "afternoon"
  const firstName = me.name.trim().split(/\s+/)[0]
  const date = new Intl.DateTimeFormat(i18n.language, {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${clock.today}T12:00:00Z`))

  const entries = (plan.data?.entries ?? [])
    .filter((entry) => !entry.anyDay)
    .sort(inOrder)
  const todays = entries.filter((entry) => entry.date === clock.today)
  // Today's next meal first; with dinner open, an idea for tonight; after
  // that, the next day's.
  const nextToday = nextMeal(todays, clock)
  const idea = !nextToday && wantsTonightIdea(todays, clock)
  const upNext =
    nextToday ??
    (idea
      ? null
      : nextMeal(
          entries.filter((entry) => entry.date > clock.today),
          clock
        ))
  const others = todays.filter((entry) => entry !== upNext)

  return (
    <div className="grid gap-8 pt-2 md:pt-4">
      <header className="grid gap-1">
        <h1 className="font-heading text-3xl font-semibold tracking-tight md:text-4xl">
          {firstName
            ? t(`today.greeting.${greeting}`, { name: firstName })
            : t(`today.greetingAlone.${greeting}`)}
        </h1>
        <p className="text-muted-foreground">{date}</p>
      </header>

      <AutoplanNote />
      <AiLimitNote />
      <InstallBanner />

      {recent.data?.total === 0 ? (
        <Welcome />
      ) : (
        <>
          <section aria-label={t("today.title")} className="grid gap-3">
            {plan.isPending ? (
              <Skeleton className="h-72 rounded-3xl" />
            ) : upNext ? (
              <UpNext entry={upNext} today={clock.today} others={others} />
            ) : idea ? (
              <TonightIdea today={clock.today} others={others} />
            ) : (
              <NothingAhead others={others} />
            )}
          </section>
          <Glance entries={entries} />
          <ComingUp entries={entries} loading={plan.isPending} />
          <Shelves />
        </>
      )}
    </div>
  )
}

/**
 * The next meal, big: with whether it's on the list, what's home for it
 * already, and the rest of today's meals.
 */
function UpNext({
  entry,
  today,
  others,
}: {
  entry: PlanEntry
  today: string
  others: PlanEntry[]
}) {
  const { t, i18n } = useTranslation()
  const list = useQuery(listQuery)
  const pantry = useQuery(pantryQuery)
  const listed = (list.data?.items ?? []).some(
    (item) => !item.checked && item.meals.some((meal) => meal.id === entry.id)
  )
  const home = (pantry.data?.items ?? [])
    .filter((item) => item.meals.some((meal) => meal.id === entry.id))
    .map((item) => item.name)
  const names = new Intl.ListFormat(i18n.language, { type: "conjunction" })
  return (
    <MealHero
      entry={entry}
      today={today}
      facts={listed && <Fact>{t("today.onTheList")}</Fact>}
      note={
        home.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {t("today.atHome", { foods: names.format(home.slice(0, 4)) })}
          </p>
        )
      }
    >
      <AlsoToday entries={others} />
    </MealHero>
  )
}

/** Nothing ahead to cook: today's done, or nothing's planned. */
function NothingAhead({ others }: { others: PlanEntry[] }) {
  const { t } = useTranslation()
  return (
    <article className="grid gap-3 rounded-3xl border border-dashed bg-card p-6 text-card-foreground md:p-8">
      <h2 className="font-heading text-2xl font-semibold">
        {others.length > 0 ? t("today.done") : t("today.nothing")}
      </h2>
      <p className="text-muted-foreground">{t("today.nothingHint")}</p>
      <div>
        <Button variant="outline" render={<Link to="/plan" />}>
          {t("today.openPlan")}
        </Button>
      </div>
      <AlsoToday entries={others} />
    </article>
  )
}
