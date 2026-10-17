import { useQuery } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { api, ApiError, unwrap } from "@/lib/api/client"

import {
  useRefreshRecipes,
  versionsQuery,
  type Recipe,
  type RecipeVersion,
} from "./queries"

/** How a recipe was before each change, with a way back to any of them. */
export function VersionsDialog({
  recipe,
  open,
  onOpenChange,
}: {
  recipe: Recipe
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const versions = useQuery({ ...versionsQuery(recipe.slug), enabled: open })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("recipes.versions.title")}</DialogTitle>
          <DialogDescription>
            {t("recipes.versions.description")}
          </DialogDescription>
        </DialogHeader>
        {versions.isPending ? (
          <Skeleton className="h-24 rounded-2xl" />
        ) : !versions.data?.length ? (
          <p className="text-sm text-muted-foreground">
            {t("recipes.versions.none")}
          </p>
        ) : (
          <ul className="max-h-[60vh] divide-y overflow-y-auto rounded-2xl border">
            {versions.data.map((version) => (
              <VersionRow
                key={version.id}
                recipe={recipe}
                version={version}
                onRestored={() => onOpenChange(false)}
              />
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}

function VersionRow({
  recipe,
  version,
  onRestored,
}: {
  recipe: Recipe
  version: RecipeVersion
  onRestored: () => void
}) {
  const { t, i18n } = useTranslation()
  const refresh = useRefreshRecipes()
  const [busy, setBusy] = React.useState(false)
  const when = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(version.createdAt))

  async function restore() {
    setBusy(true)
    try {
      await unwrap(
        api.POST("/api/recipes/{recipe}/versions/{versionId}/restore", {
          params: { path: { recipe: recipe.id, versionId: version.id } },
        })
      )
      await refresh()
      toast.success(t("recipes.versions.restored"))
      onRestored()
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      toast.error(error.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="flex items-center gap-3 p-4">
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {t(`recipes.versions.source.${version.source}`)}
        </p>
        <p className="truncate text-sm text-muted-foreground">
          {[
            when,
            version.createdBy,
            version.name !== recipe.name && version.name,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={restore} disabled={busy}>
        {busy && <Spinner />}
        {t("recipes.versions.restore")}
      </Button>
    </li>
  )
}
