import { Link } from "@tanstack/react-router"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useRefreshRecipes } from "@/features/recipes/queries"
import { formatMinutes } from "@/features/recipes/format"
import { api, ApiError, unwrap } from "@/lib/api/client"
import { cn } from "@/lib/utils"

import type { ShelfRecipe } from "./queries"

/** Imports a recipe from its page, saying so; the new recipe's slug, or null. */
export function useImportRecipe() {
  const { t } = useTranslation()
  const refresh = useRefreshRecipes()
  return async (url: string) => {
    try {
      const result = await unwrap(
        api.POST("/api/recipes/import", { body: { url } })
      )
      await refresh()
      toast.success(t("recipes.import.added", { name: result.recipe.name }))
      return result.recipe
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
      return null
    }
  }
}

/** A recipe out on a site: its photo, site and time, and Import or Open. */
export function ShelfRecipeCard({
  recipe,
  className,
}: {
  recipe: ShelfRecipe
  className?: string
}) {
  const { t } = useTranslation()
  const importRecipe = useImportRecipe()
  const [busy, setBusy] = React.useState(false)
  const [imported, setImported] = React.useState<string | null>(null)
  const slug = imported ?? recipe.inLibrary?.slug ?? null

  async function importIt() {
    setBusy(true)
    const made = await importRecipe(recipe.url)
    if (made) setImported(made.slug)
    setBusy(false)
  }

  return (
    <article
      className={cn(
        "grid h-full grid-rows-[auto_1fr] overflow-hidden rounded-3xl border bg-card text-card-foreground",
        className
      )}
    >
      <div className="aspect-[4/3] bg-muted">
        {recipe.photo && (
          <img
            src={recipe.photo}
            alt=""
            loading="lazy"
            className="size-full object-cover"
          />
        )}
      </div>
      <div className="grid content-between gap-3 p-4">
        <div className="grid gap-1">
          <a
            href={recipe.url}
            target="_blank"
            rel="noreferrer noopener"
            className="font-semibold break-words hover:underline"
          >
            {recipe.name}
          </a>
          <p className="text-sm text-muted-foreground">
            {[
              recipe.site,
              recipe.minutes != null && formatMinutes(t, recipe.minutes),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {recipe.description && (
            <p className="line-clamp-3 text-sm">{recipe.description}</p>
          )}
          {!recipe.suits && (
            <p className="text-sm font-medium text-destructive">
              {t("find.doesntSuit")}
            </p>
          )}
        </div>
        {slug ? (
          <Button
            variant="outline"
            size="sm"
            render={<Link to="/recipes/$slug" params={{ slug }} />}
          >
            {imported ? t("find.open") : t("find.inLibrary")}
          </Button>
        ) : (
          <Button size="sm" disabled={busy} onClick={() => void importIt()}>
            {busy && <Spinner data-icon="inline-start" />}
            {t("find.import")}
          </Button>
        )}
      </div>
    </article>
  )
}
