import { ArrowLeft01Icon, Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { useAiFor } from "@/features/ai/needs-ai"
import { Search } from "@/features/find/discover-tab"
import { collectionQuery } from "@/features/find/queries"
import { ShelfRecipeCard } from "@/features/find/shelf-recipe-card"
import { api, ApiError, unwrap } from "@/lib/api/client"

export const Route = createFileRoute("/_app/recipes/find/$collection")({
  component: CollectionPage,
})

/** A starter collection: its recipes, Import all, and Find more with AI. */
function CollectionPage() {
  const { t } = useTranslation()
  const { collection: id } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const ai = useAiFor("discover")
  const { data: collection, isPending, isError } = useQuery(collectionQuery(id))
  const [busy, setBusy] = React.useState<"import" | "find" | null>(null)

  async function importAll() {
    setBusy("import")
    try {
      const started = await unwrap(
        api.POST("/api/collections/{collection}/import", {
          params: { path: { collection: id } },
        })
      )
      await navigate({
        to: "/recipes/import/$importId",
        params: { importId: started.id },
      })
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    } finally {
      setBusy(null)
    }
  }

  async function findMore() {
    setBusy("find")
    try {
      await unwrap(
        api.POST("/api/collections/{collection}/find", {
          params: { path: { collection: id } },
        })
      )
      await queryClient.invalidateQueries({
        queryKey: collectionQuery(id).queryKey,
      })
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    } finally {
      setBusy(null)
    }
  }

  const finding = collection?.found?.status === "searching"

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="mt-2 -ml-3 md:mt-4"
        render={<Link to="/recipes/find" search={{ tab: "collections" }} />}
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
        {t("find.title")}
      </Button>
      {isPending ? (
        <div className="grid gap-4 pt-4">
          <Skeleton className="h-10 w-64" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => (
              <Skeleton key={index} className="h-72 rounded-3xl" />
            ))}
          </div>
        </div>
      ) : isError || !collection ? (
        <p className="pt-4 text-muted-foreground">
          {t("find.collections.missing")}
        </p>
      ) : (
        <>
          <PageHeader
            title={collection.title}
            description={collection.description}
            actions={
              collection.toImport > 0 && (
                <Button
                  disabled={busy !== null}
                  onClick={() => void importAll()}
                >
                  {busy === "import" && <Spinner data-icon="inline-start" />}
                  {t("find.collections.importAll", {
                    count: collection.toImport,
                  })}
                </Button>
              )
            }
          />
          <div className="grid gap-8">
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {collection.recipes.map((recipe) => (
                <li key={recipe.id}>
                  <ShelfRecipeCard recipe={recipe} />
                </li>
              ))}
            </ul>

            {ai.ready && (
              <section className="grid gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="grid gap-1">
                    <h2 className="font-heading text-xl font-semibold">
                      {t("find.collections.moreTitle")}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {t("find.collections.moreHint")}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    disabled={busy !== null || finding}
                    onClick={() => void findMore()}
                  >
                    {busy === "find" || finding ? (
                      <Spinner data-icon="inline-start" />
                    ) : (
                      <HugeiconsIcon
                        icon={Search01Icon}
                        strokeWidth={2}
                        data-icon="inline-start"
                      />
                    )}
                    {collection.found
                      ? t("find.collections.findAgain")
                      : t("find.collections.findMore")}
                  </Button>
                </div>
                {collection.found && (
                  <Search search={collection.found} hideTheme />
                )}
              </section>
            )}
          </div>
        </>
      )}
    </>
  )
}
