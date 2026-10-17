import { CookBookIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { cookAgain } from "@merran/shared"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import { Skeleton } from "@/components/ui/skeleton"
import { useHouseholdClock } from "@/features/plan/queries"
import type { RecipeSummary } from "@/features/recipes/queries"
import { formatRelativeDate } from "@/lib/format"

import { recentRecipesQuery, topRatedQuery } from "./queries"
import { SectionHeading } from "./section-heading"

/** Favorites not made in three weeks, and what was added lately. */
export function Shelves() {
  const { t, i18n } = useTranslation()
  const { today } = useHouseholdClock()
  const top = useQuery(topRatedQuery)
  const recent = useQuery(recentRecipesQuery)
  if (!top.data || !recent.data)
    return <Skeleton className="h-48 rounded-3xl" />
  const again = cookAgain(top.data.recipes, today)

  return (
    <div className="grid gap-8">
      {again.length > 0 && (
        <Shelf
          id="cook-again"
          title={t("today.shelves.cookAgain")}
          recipes={again}
          detail={(recipe) =>
            recipe.lastMadeAt
              ? t("today.shelves.made", {
                  when: formatRelativeDate(recipe.lastMadeAt, i18n.language),
                })
              : t("today.shelves.notMade")
          }
        />
      )}
      <Shelf
        id="recently-added"
        title={t("today.shelves.recent")}
        link={t("today.shelves.all")}
        recipes={recent.data.recipes}
        detail={(recipe) =>
          t("today.shelves.added", {
            when: formatRelativeDate(recipe.createdAt, i18n.language),
          })
        }
      />
    </div>
  )
}

function Shelf({
  id,
  title,
  link,
  recipes,
  detail,
}: {
  id: string
  title: string
  link?: string
  recipes: RecipeSummary[]
  detail: (recipe: RecipeSummary) => string
}) {
  return (
    <section aria-labelledby={id} className="grid gap-3">
      <SectionHeading id={id} to={link ? "/recipes" : undefined} link={link}>
        {title}
      </SectionHeading>
      {/* A row to swipe through on a phone, a grid on bigger screens. */}
      <ul className="-mx-4 flex snap-x scroll-px-4 [scrollbar-width:none] gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 md:pb-0 lg:grid-cols-6">
        {recipes.map((recipe) => (
          <li key={recipe.id} className="w-40 shrink-0 snap-start md:w-auto">
            <Link
              to="/recipes/$slug"
              params={{ slug: recipe.slug }}
              className="group grid gap-2 rounded-2xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {recipe.photo ? (
                <img
                  src={recipe.photo.card}
                  alt=""
                  loading="lazy"
                  className="aspect-[4/3] w-full rounded-2xl object-cover transition-opacity group-hover:opacity-90"
                />
              ) : (
                <span className="flex aspect-[4/3] w-full items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                  <HugeiconsIcon
                    icon={CookBookIcon}
                    strokeWidth={1.5}
                    className="size-8"
                  />
                </span>
              )}
              <span className="grid gap-0.5 px-0.5">
                <span className="line-clamp-2 leading-snug font-medium group-hover:underline">
                  {recipe.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {detail(recipe)}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
