import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import * as React from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

import { activeLinkImportsQuery } from "./link-imports"
import { useRefreshRecipes } from "./queries"

/**
 * On Recipes, while links are being imported: how far it's got, and the
 * way to its page. When it's finished, its recipes show.
 */
export function LinkImportsBanner() {
  const { t } = useTranslation()
  const refreshRecipes = useRefreshRecipes()
  const { data } = useQuery(activeLinkImportsQuery)
  const imports = data?.imports ?? []

  const going = imports.map((linkImport) => linkImport.id).join(",")
  const before = React.useRef(going)
  React.useEffect(() => {
    if (before.current && before.current !== going) void refreshRecipes()
    before.current = going
  }, [going, refreshRecipes])

  const latest = imports[0]
  if (!latest) return null
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-sm">
      <Spinner />
      <span className="min-w-0 flex-1" aria-live="polite">
        {t("recipes.links.banner", {
          count: latest.total,
          total: latest.total,
          done: latest.done,
        })}
      </span>
      <Button
        variant="outline"
        size="sm"
        render={
          <Link
            to="/recipes/import/$importId"
            params={{ importId: latest.id }}
          />
        }
      >
        {t("recipes.links.see")}
      </Button>
    </div>
  )
}
