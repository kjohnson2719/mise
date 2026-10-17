import { RefreshIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useCapability } from "@/features/capabilities/queries"
import { siteRecipesQuery, type ShelfRecipe } from "@/features/find/queries"
import { useImportRecipe } from "@/features/find/shelf-recipe-card"
import { Fact } from "@/features/plan/next-meal-card"
import { suggest, type PlanEntry } from "@/features/plan/queries"
import { usePlanActions } from "@/features/plan/use-plan-actions"
import { useWhyText } from "@/features/plan/why"
import { formatMinutes } from "@/features/recipes/format"

import { AlsoToday } from "./also-today"

/** What a site's recipe must be to be an idea for dinner. */
const DINNER: readonly string[] = ["main", "soup", "salad"]

/** Where ideas come from: both, by turns, or one of them. */
const SOURCES = ["both", "recipes", "sites"] as const
type Source = (typeof SOURCES)[number]

/**
 * Dinner's open tonight: one idea at a time from the household's recipes,
 * the way Fill the week picks (using up what needs using, keeping to
 * tastes and the night's theme), saying why; or something new on the
 * sites it follows. Plan it for tonight (importing it first, for a site's),
 * or another idea, taking turns between the two.
 */
export function TonightIdea({
  today,
  others,
}: {
  today: string
  others: PlanEntry[]
}) {
  const { t } = useTranslation()
  const actions = usePlanActions()
  const whyText = useWhyText()
  const importRecipe = useImportRecipe()
  const id = React.useId()
  // Ideas already shown, so Another idea is another.
  const [seen, setSeen] = React.useState<string[]>([])
  const [seenSites, setSeenSites] = React.useState<string[]>([])
  const [source, setSource] = React.useState<Source>("both")
  const [turn, setTurn] = React.useState(0)
  const [planning, setPlanning] = React.useState(false)
  const ideas = useQuery({
    queryKey: ["ideas", "tonight", today, seen],
    queryFn: async () =>
      (await suggest([{ date: today, meal: "dinner" }], seen)).suggestions[0] ??
      null,
    staleTime: Infinity,
    placeholderData: (previous) => previous,
  })
  const sitesOn = useCapability("sites")
  const fromSites = useQuery({ ...siteRecipesQuery, enabled: sitesOn })
  // New on the household's sites: a dinner, not had, and suiting it.
  const siteNew = (fromSites.data?.recipes ?? []).filter(
    (recipe) =>
      recipe.suits &&
      !recipe.inLibrary &&
      recipe.courses.some((course) => DINNER.includes(course))
  )
  const siteIdea = siteNew.find((recipe) => !seenSites.includes(recipe.id))
  const idea = ideas.data

  if (ideas.isPending) return <Skeleton className="h-72 rounded-3xl" />

  // Both take turns: the household's recipes first.
  const showSite =
    siteIdea !== undefined &&
    (source === "sites" || (source === "both" && (turn % 2 === 1 || !idea)))
  const shownLibrary = source !== "sites" && !showSite ? idea : null

  function another() {
    if (showSite) setSeenSites([...seenSites, siteIdea!.id])
    else if (idea) setSeen([...seen, idea.recipe.id])
    setTurn(turn + 1)
  }

  function startOver() {
    setSeen([])
    setSeenSites([])
    setTurn(0)
  }

  const choose = siteNew.length > 0 && (
    <ToggleGroup
      variant="outline"
      size="sm"
      value={[source]}
      onValueChange={(value) => {
        const next = value[0] as Source | undefined
        if (next) setSource(next)
      }}
      aria-label={t("today.idea.from")}
    >
      {SOURCES.map((option) => (
        <ToggleGroupItem key={option} value={option}>
          {t(`today.idea.sources.${option}`)}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )

  if (!showSite && !shownLibrary) {
    return (
      <article className="grid gap-3 rounded-3xl border border-dashed bg-card p-6 text-card-foreground md:p-8">
        <h2 className="font-heading text-2xl font-semibold">
          {t("today.idea.none")}
        </h2>
        <p className="text-muted-foreground">
          {seen.length + seenSites.length > 0
            ? t("today.idea.allSeen")
            : t("today.idea.noneHint")}
        </p>
        <div className="flex flex-wrap gap-2">
          {seen.length + seenSites.length > 0 && (
            <Button variant="outline" onClick={startOver}>
              {t("today.idea.startOver")}
            </Button>
          )}
          <Button variant="outline" render={<Link to="/plan" />}>
            {t("today.openPlan")}
          </Button>
        </div>
        {choose}
        <AlsoToday entries={others} />
      </article>
    )
  }

  async function planLibrary() {
    if (!shownLibrary) return
    setPlanning(true)
    const added = await actions.add({
      date: today,
      meal: "dinner",
      recipe: shownLibrary.recipe.id,
      withRecipe: shownLibrary.withRecipe?.id ?? null,
      why: shownLibrary.why,
    })
    setPlanning(false)
    if (added) {
      toast.success(t("today.idea.planned", { name: shownLibrary.recipe.name }))
    }
  }

  async function planSite(recipe: ShelfRecipe) {
    setPlanning(true)
    const made = await importRecipe(recipe.url)
    if (made) {
      const added = await actions.add({
        date: today,
        meal: "dinner",
        recipe: made.id,
        withRecipe: null,
        why: [],
      })
      if (added) toast.success(t("today.idea.planned", { name: made.name }))
    }
    setPlanning(false)
  }

  const busy = planning || ideas.isFetching
  const photo = showSite ? siteIdea!.photo : shownLibrary!.recipe.photo
  const minutes = showSite
    ? siteIdea!.minutes
    : shownLibrary!.recipe.totalMinutes

  return (
    <article
      aria-labelledby={id}
      className="overflow-hidden rounded-3xl border bg-card text-card-foreground sm:flex"
    >
      {photo && (
        <div className="relative shrink-0 overflow-hidden bg-muted sm:min-h-56 sm:w-72">
          <img
            src={photo}
            alt=""
            className="aspect-[16/10] w-full object-cover sm:absolute sm:inset-0 sm:aspect-auto sm:h-full"
          />
        </div>
      )}
      <div className="grid min-w-0 flex-1 content-center gap-4 p-5 md:p-7">
        <div className="grid gap-2">
          <p className="justify-self-start rounded-full bg-primary px-3 py-1 text-xs font-bold tracking-wider text-primary-foreground uppercase">
            {t("today.idea.badge")}
          </p>
          <h2
            id={id}
            className="font-heading text-2xl leading-tight font-semibold md:text-3xl"
          >
            {showSite ? (
              <a
                href={siteIdea!.url}
                target="_blank"
                rel="noreferrer noopener"
                className="hover:underline"
              >
                {siteIdea!.name}
              </a>
            ) : (
              <>
                <Link
                  to="/recipes/$slug"
                  params={{ slug: shownLibrary!.recipe.slug }}
                  search={
                    shownLibrary!.withRecipe
                      ? { with: shownLibrary!.withRecipe.slug }
                      : {}
                  }
                  className="hover:underline"
                >
                  {shownLibrary!.recipe.name}
                </Link>
                {shownLibrary!.withRecipe && (
                  <span className="font-normal text-muted-foreground">
                    {" "}
                    {t("plan.withName", {
                      name: shownLibrary!.withRecipe.name,
                    })}
                  </span>
                )}
              </>
            )}
          </h2>
          <p className="text-sm font-medium text-primary">
            {showSite
              ? t("today.idea.fromSite", { site: siteIdea!.site })
              : shownLibrary!.why.length > 0
                ? whyText(shownLibrary!.why)
                : t("today.idea.fromRecipes")}
          </p>
          {showSite && siteIdea!.description && (
            <p className="line-clamp-2 text-sm">{siteIdea!.description}</p>
          )}
          {((!showSite && shownLibrary!.recipe.servings != null) ||
            minutes != null) && (
            <div className="flex flex-wrap gap-1.5">
              {!showSite && shownLibrary!.recipe.servings != null && (
                <Fact>
                  {t("plan.servings", {
                    count: shownLibrary!.recipe.servings,
                  })}
                </Fact>
              )}
              {minutes != null && <Fact>{formatMinutes(t, minutes)}</Fact>}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="lg"
            disabled={busy}
            onClick={() =>
              void (showSite ? planSite(siteIdea!) : planLibrary())
            }
          >
            {planning && <Spinner data-icon="inline-start" />}
            {showSite ? t("today.idea.importAndPlan") : t("today.idea.plan")}
          </Button>
          <Button size="lg" variant="outline" disabled={busy} onClick={another}>
            <HugeiconsIcon
              icon={RefreshIcon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            {t("today.idea.another")}
          </Button>
        </div>
        {choose}
        <AlsoToday entries={others} />
      </div>
    </article>
  )
}
