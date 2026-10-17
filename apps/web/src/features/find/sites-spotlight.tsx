import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  PauseIcon,
  PlayIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import * as React from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useCapability } from "@/features/capabilities/queries"
import { formatMinutes } from "@/features/recipes/format"
import { formatRelativeDate } from "@/lib/format"
import { cn } from "@/lib/utils"

import { siteRecipesQuery, sitesQuery, type ShelfRecipe } from "./queries"
import { useImportRecipe } from "./shelf-recipe-card"
import { Suggestions } from "./sites-tab"

/** How long each recipe stays in the spotlight. */
const EVERY_MS = 6000

/** The most it goes round. */
const MOST = 12

function useReducedMotion() {
  const [reduced, setReduced] = React.useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
  React.useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)")
    const changed = () => setReduced(query.matches)
    query.addEventListener("change", changed)
    return () => query.removeEventListener("change", changed)
  }, [])
  return reduced
}

/**
 * From your sites: the followed sites' newest recipes, one at a time in a
 * spotlight that moves on every few seconds, with the next ones under it.
 * Folded away while the library is searched or filtered.
 */
export function SitesSpotlight({ folded }: { folded: boolean }) {
  const { t, i18n } = useTranslation()
  const sitesOn = useCapability("sites")
  const { data } = useQuery({ ...siteRecipesQuery, enabled: sitesOn })
  const reduced = useReducedMotion()
  const importRecipe = useImportRecipe()
  const [index, setIndex] = React.useState(0)
  const [paused, setPaused] = React.useState(false)
  const [holding, setHolding] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  const recipes = React.useMemo(() => {
    const suiting = (data?.recipes ?? []).filter((recipe) => recipe.suits)
    return [
      ...suiting.filter((recipe) => !recipe.inLibrary),
      ...suiting.filter((recipe) => recipe.inLibrary),
    ].slice(0, MOST)
  }, [data])
  const count = recipes.length
  const moving = count > 1 && !paused && !holding && !reduced && !folded

  React.useEffect(() => {
    if (!moving) return
    const timer = window.setInterval(
      () => setIndex((at) => (at + 1) % count),
      EVERY_MS
    )
    return () => window.clearInterval(timer)
  }, [moving, count])

  if (!sitesOn || count === 0) return null
  const at = index % count
  const recipe = recipes[at]!
  const next = [1, 2, 3, 4]
    .map((step) => recipes[(at + step) % count]!)
    .filter((other, i, all) => other !== recipe && all.indexOf(other) === i)

  async function importIt(shown: ShelfRecipe) {
    setBusy(true)
    await importRecipe(shown.url)
    setBusy(false)
  }

  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows] duration-300 motion-reduce:transition-none",
        folded ? "grid-rows-[0fr]" : "grid-rows-[1fr]"
      )}
      inert={folded}
    >
      <section
        aria-label={t("find.spotlight.title")}
        className="min-h-0 overflow-hidden"
        onMouseEnter={() => setHolding(true)}
        onMouseLeave={() => setHolding(false)}
        onFocus={() => setHolding(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setHolding(false)
          }
        }}
      >
        <div className="grid gap-3">
          <article className="grid grid-cols-[6.5rem_minmax(0,1fr)] overflow-hidden rounded-3xl border bg-card text-card-foreground sm:h-64 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <div className="relative min-h-36 bg-muted">
              {recipes.map((shown, i) =>
                shown.photo ? (
                  <img
                    key={shown.id}
                    src={shown.photo}
                    alt=""
                    loading={i === at ? "eager" : "lazy"}
                    className={cn(
                      "absolute inset-0 size-full object-cover transition-opacity duration-700 motion-reduce:transition-none",
                      i === at ? "opacity-100" : "opacity-0"
                    )}
                  />
                ) : null
              )}
            </div>
            <div className="grid min-w-0 content-between gap-3 p-4 sm:p-5">
              <div className="grid min-w-0 gap-1.5" aria-live="polite">
                <p className="text-xs font-bold tracking-wider text-primary uppercase">
                  {t("find.spotlight.title")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {[
                    recipe.site,
                    recipe.publishedAt &&
                      formatRelativeDate(recipe.publishedAt, i18n.language),
                    recipe.minutes != null && formatMinutes(t, recipe.minutes),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <h2 className="line-clamp-2 font-heading text-lg leading-tight font-semibold break-words sm:text-xl md:text-2xl">
                  {recipe.name}
                </h2>
                {recipe.description && (
                  <p className="hidden text-sm sm:line-clamp-2">
                    {recipe.description}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-2">
                  {recipe.inLibrary ? (
                    <Button
                      size="sm"
                      variant="outline"
                      render={
                        <Link
                          to="/recipes/$slug"
                          params={{ slug: recipe.inLibrary.slug }}
                        />
                      }
                    >
                      {t("find.inLibrary")}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => void importIt(recipe)}
                    >
                      {busy && <Spinner data-icon="inline-start" />}
                      {t("find.import")}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    render={
                      <a
                        href={recipe.url}
                        target="_blank"
                        rel="noreferrer noopener"
                      />
                    }
                  >
                    {t("find.spotlight.onSite")}
                  </Button>
                </div>
                {count > 1 && (
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={t("find.spotlight.previous")}
                      onClick={() => setIndex((at - 1 + count) % count)}
                    >
                      <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
                    </Button>
                    <div className="flex gap-1" aria-hidden>
                      {recipes.map((shown, i) => (
                        <span
                          key={shown.id}
                          className={cn(
                            "size-1.5 rounded-full",
                            i === at ? "bg-primary" : "bg-muted-foreground/30"
                          )}
                        />
                      ))}
                    </div>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={t("find.spotlight.next")}
                      onClick={() => setIndex((at + 1) % count)}
                    >
                      <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
                    </Button>
                    {!reduced && (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={
                          paused
                            ? t("find.spotlight.play")
                            : t("find.spotlight.pause")
                        }
                        onClick={() => setPaused(!paused)}
                      >
                        <HugeiconsIcon
                          icon={paused ? PlayIcon : PauseIcon}
                          strokeWidth={2}
                        />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </article>
          {next.length > 0 && (
            <ul className="hidden gap-3 sm:grid sm:grid-cols-4">
              {next.map((other) => (
                <li key={other.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-2xl border bg-card p-2 text-left text-sm hover:bg-muted"
                    onClick={() => setIndex(recipes.indexOf(other))}
                  >
                    <span className="size-10 shrink-0 overflow-hidden rounded-xl bg-muted">
                      {other.photo && (
                        <img
                          src={other.photo}
                          alt=""
                          loading="lazy"
                          className="size-full object-cover"
                        />
                      )}
                    </span>
                    <span className="line-clamp-2 min-w-0 font-medium">
                      {other.name}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Link
            to="/recipes/find"
            search={{ tab: "sites" }}
            className="justify-self-end text-sm font-medium text-primary hover:underline"
          >
            {t("find.spotlight.all")}
          </Link>
        </div>
      </section>
    </div>
  )
}

/**
 * Before any site is followed: a few to start with, under the library.
 */
export function SitesStart() {
  const { t } = useTranslation()
  const sitesOn = useCapability("sites")
  const { data } = useQuery({ ...sitesQuery, enabled: sitesOn })
  if (!sitesOn || !data || data.sites.length > 0) return null
  if (data.suggestions.length === 0) return null

  return (
    <section className="grid gap-4 rounded-3xl border border-dashed p-5 md:p-6">
      <div className="grid gap-1">
        <h2 className="font-heading text-xl font-semibold">
          {t("find.spotlight.startTitle")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("find.spotlight.startHint")}
        </p>
      </div>
      <Suggestions suggestions={data.suggestions} limit={4} />
      <Link
        to="/recipes/find"
        search={{ tab: "sites" }}
        className="text-sm font-medium text-primary hover:underline"
      >
        {t("find.spotlight.more")}
      </Link>
    </section>
  )
}
