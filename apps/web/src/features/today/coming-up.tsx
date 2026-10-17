import { addDays, daysAhead, weekStartOf } from "@merran/shared"
import { Link } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import { Skeleton } from "@/components/ui/skeleton"
import { formatWeekday } from "@/features/plan/format"
import { useHouseholdClock, type PlanEntry } from "@/features/plan/queries"
import { cn } from "@/lib/utils"

import { SectionHeading } from "./section-heading"

/**
 * The days left this week, a card each with its dinner (or its first
 * meal) and the rest; near the end of the week, the next three days.
 */
export function ComingUp({
  entries,
  loading,
}: {
  entries: PlanEntry[]
  loading: boolean
}) {
  const { t, i18n } = useTranslation()
  const clock = useHouseholdClock()
  const { days, restOfWeek } = daysAhead(clock.today, clock.weekStartsOn)
  const nameOf = (entry: PlanEntry) => entry.recipe?.name ?? entry.note ?? ""

  return (
    <section aria-labelledby="coming-up" className="grid gap-3">
      <SectionHeading id="coming-up" to="/plan" link={t("nav.plan")}>
        {restOfWeek ? t("today.comingUp.restOfWeek") : t("today.comingUp.next")}
      </SectionHeading>
      {loading ? (
        <Skeleton className="h-28 rounded-3xl" />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {days.map((day) => {
            const meals = entries.filter((entry) => entry.date === day)
            const main =
              meals.find((entry) => entry.meal === "dinner") ?? meals[0]
            const rest = meals.filter((entry) => entry !== main)
            return (
              <li key={day}>
                <Link
                  to="/plan"
                  search={{ week: weekStartOf(day, clock.weekStartsOn) }}
                  className="grid h-full content-start gap-1 rounded-3xl border bg-card p-5 text-card-foreground transition-colors outline-none hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {day === addDays(clock.today, 1)
                      ? t("today.comingUp.tomorrow")
                      : formatWeekday(day, i18n.language)}
                  </span>
                  {main ? (
                    <>
                      <span
                        className={cn(
                          "font-semibold",
                          main.status === "skipped" &&
                            "text-muted-foreground line-through"
                        )}
                      >
                        {nameOf(main)}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {rest.length > 0
                          ? t("today.comingUp.and", {
                              meals: rest
                                .map((entry) =>
                                  t("today.comingUp.forMeal", {
                                    name: nameOf(entry),
                                    meal: t(
                                      `plan.meals.${entry.meal}`
                                    ).toLowerCase(),
                                  })
                                )
                                .join(", "),
                            })
                          : t(`plan.meals.${main.meal}`)}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-muted-foreground">
                        {t("today.comingUp.nothing")}
                      </span>
                      <span className="text-sm font-medium text-primary">
                        {t("today.comingUp.planIt")}
                      </span>
                    </>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
