import {
  AiMagicIcon,
  ArrowLeft01Icon,
  CookingPotIcon,
  Delete02Icon,
  Edit02Icon,
  ImageAdd02Icon,
  ImageRemove01Icon,
  LeafIcon,
  LinkSquare02Icon,
  MoreHorizontalIcon,
  Tick02Icon,
  Calendar03Icon,
  Time04Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { pairRecipes } from "@merran/shared"
import {
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query"
import {
  createFileRoute,
  Link,
  useNavigate,
  useRouter,
} from "@tanstack/react-router"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { tastesQuery } from "@/features/household/queries"
import { CookNotes } from "@/features/recipes/cook-notes"
import { NutritionSection } from "@/features/recipes/nutrition-section"
import { DietBadges, DietDialog } from "@/features/recipes/diet-labels"
import { formatMinutes, sourceName } from "@/features/recipes/format"
import { GoesWith } from "@/features/recipes/goes-with"
import {
  convertible,
  IngredientList,
  ServingsStepper,
  UnitToggle,
  useServings,
} from "@/features/recipes/ingredient-list"
import {
  recipeQuery,
  useRefreshRecipes,
  type Recipe,
} from "@/features/recipes/queries"
import { RatingInput } from "@/features/recipes/rating-stars"
import { RecipePhoto, usePhotoActions } from "@/features/recipes/recipe-photo"
import { StepList } from "@/features/recipes/step-list"
import { TastesNote } from "@/features/recipes/tastes-note"
import { mergeLeftOut, useRecipeTastes } from "@/features/recipes/use-tastes"
import { useUnitSystem } from "@/features/recipes/use-unit-system"
import { SwapDialog } from "@/features/recipes/swaps/swap-dialog"
import { SwapsNote } from "@/features/recipes/swaps/swaps-note"
import {
  clearSwaps,
  useSwapsThisTime,
  withSwaps,
} from "@/features/recipes/swaps/this-time"
import { TidyDialog } from "@/features/recipes/tidy/tidy-dialog"
import { RecipeSuggestions } from "@/features/recipes/tidy/recipe-suggestions"
import { VersionsDialog } from "@/features/recipes/versions-dialog"
import { useCapability } from "@/features/capabilities/queries"
import { useAssistantPage } from "@/features/assistant/assistant-context"
import { PlanItDialog } from "@/features/plan/plan-it-dialog"
import { formatPrice, useCosts } from "@/features/stores/queries"
import { api, ApiError, unwrap } from "@/lib/api/client"
import { formatRelativeDate } from "@/lib/format"

type RecipePageSearch = {
  /** A recipe it goes with, shown with it. */
  with?: string
}

export const Route = createFileRoute("/_app/recipes/$slug/")({
  validateSearch: (search: Record<string, unknown>): RecipePageSearch =>
    typeof search.with === "string" && search.with ? { with: search.with } : {},
  loader: ({ context, params }) => {
    // What's left out for the household's dislikes, as it comes.
    void context.queryClient.prefetchQuery(tastesQuery)
    return context.queryClient.ensureQueryData(recipeQuery(params.slug))
  },
  component: RecipePage,
})

function RecipePage() {
  const { slug } = Route.useParams()
  const { data: recipe } = useSuspenseQuery(recipeQuery(slug))
  // A fresh page, with its own servings and ticks, for each recipe.
  return <RecipeView key={recipe.id} recipe={recipe} />
}

function RecipeView({ recipe }: { recipe: Recipe }) {
  const { t, i18n } = useTranslation()
  const costs = useCosts()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const refresh = useRefreshRecipes()
  const servings = useServings(recipe)
  const [system, setSystem] = useUnitSystem()
  const setSearch = Route.useNavigate()

  // Shown with a recipe it goes with: both, the pairing first and scaled.
  const { with: withSlug } = Route.useSearch()
  const pairedQuery = useQuery({
    ...recipeQuery(withSlug ?? ""),
    enabled: Boolean(withSlug),
  })
  const paired =
    withSlug && pairedQuery.data?.id !== recipe.id
      ? pairedQuery.data
      : undefined
  // Stand-ins used this time take their lines' places.
  const thisTime = useSwapsThisTime(recipe.id)
  const swapped = React.useMemo(
    () => withSwaps(recipe, thisTime.swaps),
    [recipe, thisTime.swaps]
  )
  const [swapping, setSwapping] = React.useState<
    Recipe["ingredients"][number] | null
  >(null)
  const router = useRouter()
  React.useEffect(
    () => () => {
      // Left for another page, not cooking it: they're forgotten.
      const path = router.state.location.pathname
      const here = `/recipes/${recipe.slug}`
      if (path !== here && !path.startsWith(`${here}/`)) clearSwaps(recipe.id)
    },
    [router, recipe.id, recipe.slug]
  )
  const both = paired
    ? pairRecipes(swapped.recipe, paired, servings.factor)
    : null
  const ingredients = both?.ingredients ?? swapped.recipe.ingredients
  const steps = both?.steps ?? swapped.recipe.steps
  const factorOf = both
    ? (lineId: string) => both.factors.get(lineId) ?? servings.factor
    : undefined
  const tastes = useRecipeTastes(swapped.recipe)
  const pairedTastes = useRecipeTastes(paired)
  const leftOut = mergeLeftOut(tastes, pairedTastes)
  const showWith = (slug: string | undefined) =>
    void setSearch({ search: slug ? { with: slug } : {}, replace: true })
  const [showVersions, setShowVersions] = React.useState(false)
  const [showDiets, setShowDiets] = React.useState(false)
  const [tidying, setTidying] = React.useState(false)
  const aiOn = useCapability("ai")
  // The assistant knows this is the recipe on screen.
  useAssistantPage({ recipe: { id: recipe.id, name: recipe.name } })
  const photo = usePhotoActions(recipe)

  async function rate(rating: number | null) {
    const key = recipeQuery(recipe.slug).queryKey
    // The stars change at once; they go back if saving fails.
    queryClient.setQueryData(key, { ...recipe, rating })
    try {
      queryClient.setQueryData(
        key,
        await unwrap(
          api.PUT("/api/recipes/{recipe}/rating", {
            params: { path: { recipe: recipe.id } },
            body: { rating },
          })
        )
      )
      await refresh()
    } catch (error) {
      queryClient.setQueryData(key, recipe)
      if (!(error instanceof ApiError)) throw error
      toast.error(error.message)
    }
  }

  const [marking, setMarking] = React.useState(false)
  const [planning, setPlanning] = React.useState(false)

  async function markMade() {
    setMarking(true)
    try {
      queryClient.setQueryData(
        recipeQuery(recipe.slug).queryKey,
        await unwrap(
          api.POST("/api/recipes/{recipe}/made", {
            params: { path: { recipe: recipe.id } },
          })
        )
      )
      await refresh()
      toast.success(t("recipes.markedMade"))
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      toast.error(error.message)
    } finally {
      setMarking(false)
    }
  }

  async function remove() {
    await unwrap(
      api.DELETE("/api/recipes/{recipe}", {
        params: { path: { recipe: recipe.id } },
      })
    )
    await refresh()
    await navigate({ to: "/recipes" })
    toast.success(t("recipes.deletedToast", { name: recipe.name }), {
      action: {
        label: t("recipes.undo"),
        onClick: async () => {
          await unwrap(
            api.POST("/api/recipes/deleted/{recipeId}/restore", {
              params: { path: { recipeId: recipe.id } },
            })
          )
          await refresh()
          await navigate({
            to: "/recipes/$slug",
            params: { slug: recipe.slug },
          })
        },
      },
    })
  }

  const cost = costs.recipes.get(recipe.id)
  const money = (cents: number) =>
    formatPrice(cents, costs.currency, i18n.language)
  const facts = [
    recipe.prepMinutes !== null && [
      t("recipes.facts.prep"),
      formatMinutes(t, recipe.prepMinutes),
    ],
    recipe.cookMinutes !== null && [
      t("recipes.facts.cook"),
      formatMinutes(t, recipe.cookMinutes),
    ],
    recipe.totalMinutes !== null && [
      t("recipes.facts.total"),
      formatMinutes(t, recipe.totalMinutes),
    ],
    recipe.yieldText && [t("recipes.facts.makes"), recipe.yieldText],
    cost && [
      t("recipes.facts.costs"),
      cost.perServing !== null
        ? t("recipes.facts.costsServing", {
            total: money(cost.total),
            serving: money(cost.perServing),
          })
        : money(cost.total),
    ],
  ].filter((fact): fact is [string, string] => Boolean(fact))

  return (
    <article className="grid gap-8 pt-2 pb-6">
      <Link
        to="/recipes"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <HugeiconsIcon
          icon={ArrowLeft01Icon}
          strokeWidth={2}
          className="size-4"
        />
        {t("nav.recipes")}
      </Link>

      {/* The photo on the left, and what the recipe is on the right. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-10">
        <RecipePhoto recipe={recipe} actions={photo} />
        <div className="grid content-start gap-4">
          <h1 className="text-3xl leading-tight font-semibold tracking-tight md:text-4xl">
            {recipe.name}
          </h1>
          {recipe.description && (
            <p className="text-lg text-muted-foreground">
              {recipe.description}
            </p>
          )}
          {facts.length > 0 && (
            <dl className="flex flex-wrap gap-x-6 gap-y-2">
              {facts.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {label}
                  </dt>
                  <dd className="font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <RatingInput value={recipe.rating} onChange={rate} />
            {recipe.lastMadeAt && (
              <span className="text-sm text-muted-foreground">
                {t("recipes.lastMade", {
                  when: formatRelativeDate(recipe.lastMadeAt, i18n.language),
                })}
              </span>
            )}
          </div>
          {recipe.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {recipe.tags.map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  render={<Link to="/recipes" search={{ tags: tag }} />}
                >
                  {tag}
                </Badge>
              ))}
            </div>
          )}
          <DietBadges
            recipe={recipe}
            diets={both?.diets}
            onCorrect={() => setShowDiets(true)}
          />
          <GoesWith
            recipe={recipe}
            selected={withSlug}
            paired={paired}
            onSelect={showWith}
          />
          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              size="lg"
              render={
                <Link
                  to="/recipes/$slug/cook"
                  params={{ slug: recipe.slug }}
                  search={{
                    ...(servings.changed
                      ? { scale: Math.round(servings.factor * 1000) / 1000 }
                      : {}),
                    ...(paired ? { with: paired.slug } : {}),
                  }}
                />
              }
            >
              <HugeiconsIcon
                icon={CookingPotIcon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              {t("recipes.startCooking")}
            </Button>
            <Button
              size="lg"
              variant="outline"
              disabled={marking}
              onClick={() => void markMade()}
            >
              <HugeiconsIcon
                icon={Tick02Icon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              {t("recipes.madeIt")}
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => setPlanning(true)}
            >
              <HugeiconsIcon
                icon={Calendar03Icon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              {t("plan.planIt")}
            </Button>
            {planning && (
              <PlanItDialog
                recipe={recipe}
                servings={
                  servings.changed && recipe.servings
                    ? Math.round(recipe.servings * servings.factor * 100) / 100
                    : null
                }
                withRecipe={paired ?? null}
                open={planning}
                onOpenChange={setPlanning}
              />
            )}
            <Button
              size="lg"
              variant="outline"
              render={
                <Link to="/recipes/$slug/edit" params={{ slug: recipe.slug }} />
              }
            >
              <HugeiconsIcon
                icon={Edit02Icon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              {t("recipes.edit")}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    size="icon-lg"
                    aria-label={t("recipes.more")}
                  />
                }
              >
                <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {aiOn && (
                  <DropdownMenuItem onClick={() => setTidying(true)}>
                    <HugeiconsIcon icon={AiMagicIcon} strokeWidth={2} />
                    {t("recipes.tidy.menu")}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => setShowVersions(true)}>
                  <HugeiconsIcon icon={Time04Icon} strokeWidth={2} />
                  {t("recipes.versions.title")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowDiets(true)}>
                  <HugeiconsIcon icon={LeafIcon} strokeWidth={2} />
                  {t("recipes.diets.label")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={photo.choose}>
                  <HugeiconsIcon icon={ImageAdd02Icon} strokeWidth={2} />
                  {recipe.photo
                    ? t("recipes.photo.change")
                    : t("recipes.photo.add")}
                </DropdownMenuItem>
                {photo.canMake && (
                  <DropdownMenuItem onClick={photo.make}>
                    <HugeiconsIcon icon={AiMagicIcon} strokeWidth={2} />
                    {recipe.photo
                      ? t("recipes.photo.makeAnother")
                      : t("recipes.photo.make")}
                  </DropdownMenuItem>
                )}
                {recipe.photo && (
                  <DropdownMenuItem onClick={() => void photo.remove()}>
                    <HugeiconsIcon icon={ImageRemove01Icon} strokeWidth={2} />
                    {t("recipes.photo.remove")}
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={remove}>
                  <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                  {t("recipes.delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <RecipeSuggestions recipeId={recipe.id} />

      {/* Ingredients in a tall column on the left, the steps beside them. */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:gap-10">
        <Card className="h-fit lg:sticky lg:top-20">
          <CardHeader className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-xl font-semibold">
              {t("recipes.fields.ingredients")}
            </CardTitle>
            {ingredients.length > 0 && <ServingsStepper servings={servings} />}
            {convertible(ingredients) && (
              <UnitToggle
                system={system}
                onChange={setSystem}
                className="w-full"
              />
            )}
          </CardHeader>
          <CardContent className="grid gap-4">
            {paired && <TastesNote recipe={paired} tastes={pairedTastes} />}
            <TastesNote
              recipe={recipe}
              tastes={tastes}
              onStandIn={
                aiOn && !paired
                  ? (index) =>
                      setSwapping(swapped.recipe.ingredients[index] ?? null)
                  : undefined
              }
            />
            <SwapsNote swaps={thisTime.swaps} onUndo={thisTime.undo} />
            {ingredients.length === 0 ? (
              <p className="text-muted-foreground">
                {t("recipes.noIngredients")}
              </p>
            ) : (
              <IngredientList
                lines={ingredients}
                factor={servings.factor}
                factorOf={factorOf}
                system={system}
                leftOut={leftOut}
                swapped={swapped.lines}
                onSwap={aiOn && !paired ? setSwapping : undefined}
                onUnswap={thisTime.undo}
              />
            )}
          </CardContent>
        </Card>

        <div className="grid content-start gap-8">
          <section className="grid gap-4">
            <h2 className="text-2xl font-semibold">
              {t("recipes.fields.steps")}
            </h2>
            {steps.length === 0 ? (
              <p className="text-muted-foreground">{t("recipes.noSteps")}</p>
            ) : (
              <StepList steps={steps} system={system} changed={swapped.steps} />
            )}
          </section>
          {recipe.notes && (
            <section className="grid gap-2">
              <h2 className="text-xl font-semibold">
                {t("recipes.fields.notes")}
              </h2>
              <p className="whitespace-pre-line text-muted-foreground">
                {recipe.notes}
              </p>
            </section>
          )}
          <NutritionSection recipe={recipe} />
          <CookNotes recipe={recipe} />
          {recipe.sourceUrl && (
            <a
              href={recipe.sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              <HugeiconsIcon
                icon={LinkSquare02Icon}
                strokeWidth={2}
                className="size-4"
              />
              {t("recipes.original", { site: sourceName(recipe.sourceUrl) })}
            </a>
          )}
        </div>
      </div>

      {photo.input}
      <VersionsDialog
        recipe={recipe}
        open={showVersions}
        onOpenChange={setShowVersions}
      />
      <DietDialog
        recipe={recipe}
        open={showDiets}
        onOpenChange={setShowDiets}
      />
      <TidyDialog recipe={recipe} open={tidying} onOpenChange={setTidying} />
      <SwapDialog
        recipe={recipe}
        line={swapping}
        factor={servings.factor}
        system={system}
        onUse={thisTime.use}
        onUndo={thisTime.undo}
        onOpenChange={(open) => {
          if (!open) setSwapping(null)
        }}
      />
    </article>
  )
}
