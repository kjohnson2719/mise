import { CookingPotIcon, Tick02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { addDays } from "@merran/shared"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import * as React from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { formatMinutes } from "@/features/recipes/format"

import { formatWeekday } from "./format"
import { cookSearch, MealMenu, servingsOf } from "./meal-tile"
import { nextMealQuery, type PlanEntry } from "./queries"
import { usePlanActions } from "./use-plan-actions"
import { useWhyText } from "./why"

/** A little fact about a meal: "4 servings", "50 min". */
export function Fact({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-secondary px-3 py-1 text-sm font-medium">
      {children}
    </span>
  )
}

/**
 * What's next: the next meal still planned, big, with its photo beside it
 * and the buttons to cook it or mark it cooked.
 */
export function NextMealCard() {
  const { data } = useQuery(nextMealQuery)
  if (!data?.entry) return null
  return <MealHero entry={data.entry} today={data.today} />
}

/**
 * A meal, big: when it is, its photo, why it was picked, its servings and
 * time, and the buttons to cook it or mark it cooked. More facts and a
 * note can go under it, and anything else below the buttons.
 */
export function MealHero({
  entry,
  today,
  facts,
  note,
  children,
}: {
  entry: PlanEntry
  /** The household's today. */
  today: string
  facts?: React.ReactNode
  note?: React.ReactNode
  children?: React.ReactNode
}) {
  const { t, i18n } = useTranslation()
  const actions = usePlanActions()
  const whyText = useWhyText()
  const id = React.useId()

  const when =
    entry.date === today
      ? t(`plan.next.today.${entry.meal}`)
      : entry.date === addDays(today, 1)
        ? t(`plan.next.tomorrow.${entry.meal}`)
        : t(`plan.next.later.${entry.meal}`, {
            day: formatWeekday(entry.date, i18n.language),
          })
  const name = entry.recipe?.name ?? entry.note ?? ""
  const servings = servingsOf(entry)
  const minutes = entry.recipe?.totalMinutes ?? null

  return (
    <article
      aria-labelledby={id}
      className="overflow-hidden rounded-3xl border bg-card text-card-foreground sm:flex"
    >
      {entry.recipe?.photo && (
        <div className="relative shrink-0 overflow-hidden bg-muted sm:min-h-56 sm:w-72">
          <Link
            to="/recipes/$slug"
            params={{ slug: entry.recipe.slug }}
            tabIndex={-1}
            className="block h-full"
          >
            <img
              src={entry.recipe.photo}
              alt=""
              className="aspect-[16/10] w-full object-cover sm:absolute sm:inset-0 sm:aspect-auto sm:h-full"
            />
          </Link>
        </div>
      )}
      <div className="grid min-w-0 flex-1 content-center gap-4 p-5 md:p-7">
        <div className="grid gap-2">
          <p className="justify-self-start rounded-full bg-primary px-3 py-1 text-xs font-bold tracking-wider text-primary-foreground uppercase">
            {when} · {t(`plan.meals.${entry.meal}`)}
          </p>
          <h2
            id={id}
            className="font-heading text-2xl leading-tight font-semibold md:text-3xl"
          >
            {entry.recipe ? (
              <Link
                to="/recipes/$slug"
                params={{ slug: entry.recipe.slug }}
                search={entry.withRecipe ? { with: entry.withRecipe.slug } : {}}
                className="hover:underline"
              >
                {name}
              </Link>
            ) : (
              name
            )}
            {entry.withRecipe && (
              <span className="font-normal text-muted-foreground">
                {" "}
                {t("plan.withName", { name: entry.withRecipe.name })}
              </span>
            )}
          </h2>
          {entry.why.length > 0 && (
            <p className="text-sm font-medium text-primary">
              {whyText(entry.why)}
            </p>
          )}
          {(servings != null || minutes != null || facts) && (
            <div className="flex flex-wrap gap-1.5">
              {servings != null && (
                <Fact>{t("plan.servings", { count: servings })}</Fact>
              )}
              {minutes != null && <Fact>{formatMinutes(t, minutes)}</Fact>}
              {facts}
            </div>
          )}
          {note}
        </div>
        <div className="flex flex-wrap gap-2">
          {entry.recipe && (
            <Button
              size="lg"
              render={
                <Link
                  to="/recipes/$slug/cook"
                  params={{ slug: entry.recipe.slug }}
                  search={cookSearch(entry)}
                />
              }
            >
              <HugeiconsIcon
                icon={CookingPotIcon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              {t("plan.startCooking")}
            </Button>
          )}
          <Button
            size="lg"
            variant="outline"
            onClick={() => void actions.change(entry, { status: "cooked" })}
          >
            <HugeiconsIcon
              icon={Tick02Icon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            {entry.recipe ? t("plan.markCooked") : t("plan.done")}
          </Button>
          <MealMenu entry={entry} name={name} large />
        </div>
        {children}
      </div>
    </article>
  )
}
