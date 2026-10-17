import {
  AiMagicIcon,
  Compass01Icon,
  CookBookIcon,
  Delete02Icon,
  MoreHorizontalIcon,
  Tag01Icon,
  TaskDone01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useInfiniteQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { SitesSpotlight, SitesStart } from "@/features/find/sites-spotlight"
import { AddRecipeDialog } from "@/features/recipes/add-recipe-dialog"
import {
  DeleteRecipesDialog,
  TagRecipesDialog,
} from "@/features/recipes/bulk-dialogs"
import { LinkImportsBanner } from "@/features/recipes/link-imports-banner"
import { useRefreshReview } from "@/features/recipes/tidy/queries"
import { ReviewBanner } from "@/features/recipes/tidy/tidy-runs"
import { useCapability } from "@/features/capabilities/queries"
import { api, ApiError, unwrap } from "@/lib/api/client"
import { ManageTagsDialog } from "@/features/recipes/manage-tags-dialog"
import {
  RECIPE_SORTS,
  RECIPE_TIMES,
  recipesQuery,
  searchDiets,
  type RecipeSearch,
  type RecipeSort,
  type RecipeTime,
} from "@/features/recipes/queries"
import { RecipeCard } from "@/features/recipes/recipe-card"
import { RecipeFilters } from "@/features/recipes/recipe-filters"
import { useDeals } from "@/features/stores/queries"
import {
  SelectButton,
  SelectionBar,
  SelectionHeader,
} from "@/features/select/selection-bar"
import {
  useSelection,
  useSelectionKeepOnly,
} from "@/features/select/use-selection"

export const Route = createFileRoute("/_app/recipes/")({
  validateSearch: (search: Record<string, unknown>): RecipeSearch => {
    const q = asText(search.q)
    const tags = asText(search.tags)
    // Only labels Merran knows, in its order.
    const diets = searchDiets({ diets: asText(search.diets) }).join(",")
    return {
      ...(q ? { q } : {}),
      ...(tags ? { tags } : {}),
      ...(diets ? { diets } : {}),
      ...((RECIPE_TIMES as readonly unknown[]).includes(Number(search.time))
        ? { time: Number(search.time) as RecipeTime }
        : {}),
      ...(search.new === true || search.new === "true"
        ? { new: true as const }
        : {}),
      ...(search.onSale === true || search.onSale === "true"
        ? { onSale: true as const }
        : {}),
      ...((RECIPE_SORTS as readonly unknown[]).includes(search.sort)
        ? { sort: search.sort as RecipeSort }
        : {}),
    }
  },
  component: RecipesPage,
})

/** The address reads "7" as a number: a search for 7 is still text. */
function asText(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : undefined
}

function RecipesPage() {
  const { t } = useTranslation()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const [managingTags, setManagingTags] = React.useState(false)
  const recipes = useInfiniteQuery(recipesQuery(search))
  const deals = useDeals()

  const setSearch = React.useCallback(
    (next: RecipeSearch) => void navigate({ search: next, replace: true }),
    [navigate]
  )
  // Select mode: pick recipes, then act on them all.
  const selection = useSelection()
  const [dialog, setDialog] = React.useState<"tags" | "delete" | null>(null)
  const shownIds = recipes.data?.pages.flatMap((page) =>
    page.recipes.map((recipe) => recipe.id)
  )
  useSelectionKeepOnly(selection, shownIds ?? [])
  const filtered = Boolean(
    search.q ||
    search.tags ||
    search.diets ||
    search.time ||
    search.new ||
    search.onSale
  )
  const total = recipes.data?.pages[0]?.total ?? 0
  const items = recipes.data?.pages.flatMap((page) => page.recipes) ?? []
  const picked = items.filter((recipe) => selection.isPicked(recipe.id))
  const aiOn = useCapability("ai")
  const refreshReview = useRefreshReview()

  /** Tidies the picked recipes in the background, into Review. */
  async function tidyPicked() {
    const ids = [...selection.picked]
    try {
      await unwrap(api.POST("/api/recipes/tidy", { body: { ids } }))
      await refreshReview()
      selection.done()
      toast.success(t("recipes.tidy.picked", { count: ids.length }), {
        action: {
          label: t("recipes.tidy.review"),
          onClick: () => void navigate({ to: "/recipes/review" }),
        },
      })
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    }
  }

  return (
    <>
      <PageHeader
        title={t("nav.recipes")}
        actions={
          selection.selecting ? (
            <SelectionHeader
              selection={selection}
              allIds={items.map((recipe) => recipe.id)}
            />
          ) : (
            <>
              <SelectButton
                selection={selection}
                disabled={items.length === 0}
              />
              <Button
                variant="outline"
                aria-label={t("find.title")}
                render={<Link to="/recipes/find" />}
              >
                <HugeiconsIcon
                  icon={Compass01Icon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                <span className="hidden sm:inline">{t("find.title")}</span>
              </Button>
              <AddRecipeDialog />
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label={t("recipes.more")}
                    />
                  }
                >
                  <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setManagingTags(true)}>
                    <HugeiconsIcon icon={Tag01Icon} strokeWidth={2} />
                    {t("recipes.manageTags")}
                  </DropdownMenuItem>
                  {aiOn && (
                    <DropdownMenuItem render={<Link to="/recipes/review" />}>
                      <HugeiconsIcon icon={TaskDone01Icon} strokeWidth={2} />
                      {t("recipes.tidy.reviewTitle")}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem render={<Link to="/recipes/deleted" />}>
                    <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                    {t("recipes.deleted.title")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )
        }
      />
      <ManageTagsDialog open={managingTags} onOpenChange={setManagingTags} />

      <div className="space-y-6">
        <LinkImportsBanner />
        <ReviewBanner />
        <RecipeFilters search={search} onChange={setSearch} />
        <SitesSpotlight folded={filtered || selection.selecting} />

        {recipes.isPending ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => (
              <Skeleton key={index} className="h-72 rounded-3xl" />
            ))}
          </div>
        ) : recipes.isError ? (
          <Empty className="rounded-3xl border border-dashed">
            <EmptyHeader>
              <EmptyTitle>{t("status.error.title")}</EmptyTitle>
              <EmptyDescription>
                {t("status.error.description")}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" onClick={() => recipes.refetch()}>
                {t("status.tryAgain")}
              </Button>
            </EmptyContent>
          </Empty>
        ) : items.length === 0 ? (
          filtered ? (
            <Empty className="rounded-3xl border border-dashed">
              <EmptyHeader>
                <EmptyTitle>{t("recipes.noMatches")}</EmptyTitle>
                <EmptyDescription>
                  {t("recipes.noMatchesHint")}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button
                  variant="outline"
                  onClick={() => setSearch({ sort: search.sort })}
                >
                  {t("recipes.clearFilters")}
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <Empty className="rounded-3xl border border-dashed">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <HugeiconsIcon icon={CookBookIcon} strokeWidth={2} />
                </EmptyMedia>
                <EmptyTitle>{t("recipes.none")}</EmptyTitle>
                <EmptyDescription>{t("recipes.noneHint")}</EmptyDescription>
              </EmptyHeader>
              <EmptyContent className="flex-row flex-wrap justify-center">
                <AddRecipeDialog />
                <Button variant="outline" render={<Link to="/recipes/find" />}>
                  {t("find.collections.browse")}
                </Button>
              </EmptyContent>
            </Empty>
          )
        ) : (
          <>
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {t("recipes.count", { count: total })}
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {items.map((recipe) => (
                <RecipeCard
                  key={recipe.id}
                  recipe={recipe}
                  onSale={deals.recipes.get(recipe.id)}
                  select={{
                    selecting: selection.selecting,
                    picked: selection.isPicked(recipe.id),
                    onToggle: () => selection.toggle(recipe.id),
                    onLongPress: () => selection.start(recipe.id),
                  }}
                />
              ))}
            </div>
            {recipes.hasNextPage && (
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  onClick={() => recipes.fetchNextPage()}
                  disabled={recipes.isFetchingNextPage}
                >
                  {recipes.isFetchingNextPage && <Spinner />}
                  {t("recipes.showMore")}
                </Button>
              </div>
            )}
          </>
        )}
        {!filtered && !selection.selecting && <SitesStart />}
        {/* Room for the action bar, so it doesn't cover the last cards. */}
        {selection.selecting && <div aria-hidden className="h-16" />}
      </div>

      <SelectionBar
        selection={selection}
        actions={[
          {
            label: t("recipes.bulk.tags"),
            icon: Tag01Icon,
            onSelect: () => setDialog("tags"),
          },
          ...(aiOn
            ? [
                {
                  label: t("recipes.tidy.menu"),
                  icon: AiMagicIcon,
                  onSelect: () => void tidyPicked(),
                },
              ]
            : []),
          {
            label: t("recipes.delete"),
            icon: Delete02Icon,
            destructive: true,
            onSelect: () => setDialog("delete"),
          },
        ]}
      />
      <TagRecipesDialog
        ids={[...selection.picked]}
        open={dialog === "tags"}
        onOpenChange={(open) => setDialog(open ? "tags" : null)}
      />
      <DeleteRecipesDialog
        recipes={picked}
        open={dialog === "delete"}
        onOpenChange={(open) => setDialog(open ? "delete" : null)}
        onDeleted={() => {
          setDialog(null)
          selection.done()
        }}
      />
    </>
  )
}
