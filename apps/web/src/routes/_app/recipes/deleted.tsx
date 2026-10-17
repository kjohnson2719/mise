import {
  ArrowLeft01Icon,
  Delete02Icon,
  RotateLeft01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/confirm-dialog"
import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Spinner } from "@/components/ui/spinner"
import {
  PurgeRecipesDialog,
  useRecipeBulk,
} from "@/features/recipes/bulk-dialogs"
import {
  deletedQuery,
  useRefreshRecipes,
  type DeletedRecipe,
} from "@/features/recipes/queries"
import { SelectMark } from "@/features/select/select-mark"
import {
  SelectButton,
  SelectionBar,
  SelectionHeader,
} from "@/features/select/selection-bar"
import {
  useSelection,
  useSelectionKeepOnly,
  type Selection,
} from "@/features/select/use-selection"
import { api, unwrap } from "@/lib/api/client"
import { formatDate } from "@/lib/format"

export const Route = createFileRoute("/_app/recipes/deleted")({
  loader: ({ context }) => context.queryClient.ensureQueryData(deletedQuery),
  component: RecentlyDeleted,
})

function RecentlyDeleted() {
  const { t } = useTranslation()
  const refresh = useRefreshRecipes()
  const { data: recipes } = useSuspenseQuery(deletedQuery)
  const bulk = useRecipeBulk()
  const selection = useSelection()
  const [purging, setPurging] = React.useState(false)
  useSelectionKeepOnly(
    selection,
    recipes.map((recipe) => recipe.id)
  )
  const picked = recipes.filter((recipe) => selection.isPicked(recipe.id))

  async function restorePicked() {
    const result = await bulk.deleted({
      action: "restore",
      ids: picked.map((recipe) => recipe.id),
    })
    if (!result) return
    selection.done()
    toast.success(t("recipes.bulk.restored", { count: result.changed }))
  }

  async function empty() {
    await unwrap(api.DELETE("/api/recipes/deleted"))
    await refresh()
    toast.success(t("recipes.deleted.emptied"))
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="mt-2 -ml-3 md:mt-4"
        render={<Link to="/recipes" />}
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
        {t("nav.recipes")}
      </Button>
      <PageHeader
        title={t("recipes.deleted.title")}
        description={t("recipes.deleted.description")}
        actions={
          selection.selecting ? (
            <SelectionHeader
              selection={selection}
              allIds={recipes.map((recipe) => recipe.id)}
            />
          ) : (
            recipes.length > 0 && (
              <>
                <SelectButton selection={selection} />
                <ConfirmDialog
                  trigger={
                    <Button variant="outline">
                      <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                      {t("recipes.deleted.empty")}
                    </Button>
                  }
                  title={t("recipes.deleted.emptyTitle")}
                  description={t("recipes.deleted.emptyDescription", {
                    count: recipes.length,
                  })}
                  confirm={t("recipes.deleted.empty")}
                  onConfirm={empty}
                />
              </>
            )
          )
        }
      />
      {recipes.length === 0 ? (
        <Empty className="rounded-3xl border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>{t("recipes.deleted.none")}</EmptyTitle>
            <EmptyDescription>{t("recipes.deleted.noneHint")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>
              {t("recipes.count", { count: recipes.length })}
            </CardTitle>
            <CardDescription>{t("recipes.deleted.keptFor")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y rounded-2xl border">
              {recipes.map((recipe) => (
                <DeletedRow
                  key={recipe.id}
                  recipe={recipe}
                  selection={selection}
                />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      {/* Room for the action bar, so it doesn't cover the last rows. */}
      {selection.selecting && <div aria-hidden className="h-16" />}

      <SelectionBar
        selection={selection}
        actions={[
          {
            label: t("recipes.bulk.restore"),
            icon: RotateLeft01Icon,
            onSelect: () => void restorePicked(),
          },
          {
            label: t("recipes.bulk.purge"),
            icon: Delete02Icon,
            destructive: true,
            onSelect: () => setPurging(true),
          },
        ]}
      />
      <PurgeRecipesDialog
        recipes={picked}
        open={purging}
        onOpenChange={setPurging}
        onPurged={() => {
          setPurging(false)
          selection.done()
        }}
      />
    </>
  )
}

function DeletedRow({
  recipe,
  selection,
}: {
  recipe: DeletedRecipe
  selection: Selection
}) {
  const { t, i18n } = useTranslation()
  const refresh = useRefreshRecipes()
  const [busy, setBusy] = React.useState(false)

  async function restore() {
    setBusy(true)
    try {
      await unwrap(
        api.POST("/api/recipes/deleted/{recipeId}/restore", {
          params: { path: { recipeId: recipe.id } },
        })
      )
      await refresh()
      toast.success(t("recipes.deleted.restored", { name: recipe.name }))
    } finally {
      setBusy(false)
    }
  }

  async function deleteForGood() {
    await unwrap(
      api.DELETE("/api/recipes/deleted/{recipeId}", {
        params: { path: { recipeId: recipe.id } },
      })
    )
    await refresh()
    toast.success(t("recipes.deleted.goneForGood", { name: recipe.name }))
  }

  const about = (
    <div className="min-w-0 flex-1 basis-48">
      <p className="truncate font-medium">{recipe.name}</p>
      <p className="text-sm text-muted-foreground">
        {t("recipes.deleted.when", {
          deleted: formatDate(recipe.deletedAt, i18n.language),
          gone: formatDate(recipe.goneAt, i18n.language),
        })}
      </p>
    </div>
  )

  // While selecting, the whole row picks it.
  if (selection.selecting) {
    const on = selection.isPicked(recipe.id)
    return (
      <li>
        <button
          type="button"
          aria-pressed={on}
          aria-label={
            on
              ? t("select.unpick", { name: recipe.name })
              : t("select.pick", { name: recipe.name })
          }
          onClick={() => selection.toggle(recipe.id)}
          className="flex w-full items-center gap-3 p-4 text-left outline-none hover:bg-muted/40 focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <SelectMark picked={on} />
          {about}
        </button>
      </li>
    )
  }

  return (
    <li className="flex flex-wrap items-center gap-3 p-4">
      {about}
      <div className="ml-auto flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={restore} disabled={busy}>
          {busy && <Spinner />}
          {t("recipes.deleted.restore")}
        </Button>
        <ConfirmDialog
          trigger={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("recipes.deleted.deleteForGood", {
                name: recipe.name,
              })}
            >
              <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
            </Button>
          }
          title={t("recipes.deleted.deleteForGoodTitle", { name: recipe.name })}
          description={t("recipes.deleted.deleteForGoodDescription")}
          confirm={t("recipes.deleted.deleteForGoodConfirm")}
          onConfirm={deleteForGood}
        />
      </div>
    </li>
  )
}
