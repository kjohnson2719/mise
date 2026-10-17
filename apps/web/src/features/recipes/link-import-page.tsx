import { Link01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import * as React from "react"
import { Trans, useTranslation } from "react-i18next"
import { toast } from "sonner"

import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { api, ApiError, unwrap } from "@/lib/api/client"
import { cn } from "@/lib/utils"

import { isGoing, linkImportQuery, linkLabel } from "./link-imports"
import { useRefreshRecipes } from "./queries"

/**
 * How an import of several links is going: each link, live, then what it
 * did, with Try again for the ones that didn't come in.
 */
export function LinkImportPage({ importId }: { importId: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const refreshRecipes = useRefreshRecipes()
  const query = useQuery(linkImportQuery(importId))
  const [busy, setBusy] = React.useState(false)
  const data = query.data

  // Once it's finished, the recipes it brought in show everywhere.
  const finished = Boolean(data && !isGoing(data))
  const refreshed = React.useRef(false)
  React.useEffect(() => {
    if (!finished || refreshed.current) return
    refreshed.current = true
    void refreshRecipes()
  }, [finished, refreshRecipes])

  async function act(work: () => Promise<void>) {
    setBusy(true)
    try {
      await work()
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (query.isPending) {
    return (
      <>
        <PageHeader title={t("recipes.links.adding")} />
        <Skeleton className="h-60 rounded-3xl" />
      </>
    )
  }
  if (!data) {
    return (
      <>
        <PageHeader title={t("recipes.links.adding")} />
        <div className="grid justify-items-start gap-3">
          <p className="text-muted-foreground">{t("recipes.links.gone")}</p>
          <Button variant="outline" render={<Link to="/recipes" />}>
            {t("recipes.links.toRecipes")}
          </Button>
        </div>
      </>
    )
  }

  const going = isGoing(data)
  const again = data.items.filter(
    (item) => item.state === "failed" || item.state === "stopped"
  )
  const tagSearch = data.tag ? { tags: data.tag } : {}

  const stop = () =>
    act(async () => {
      queryClient.setQueryData(
        linkImportQuery(importId).queryKey,
        await unwrap(
          api.POST("/api/recipes/import/links/{importId}/stop", {
            params: { path: { importId } },
          })
        )
      )
    })

  // The ones that didn't come in, as an import of their own.
  const tryAgain = () =>
    act(async () => {
      const made = await unwrap(
        api.POST("/api/recipes/import/links", {
          body: { urls: again.map((item) => item.url), tag: data.tag },
        })
      )
      await queryClient.invalidateQueries({ queryKey: ["link-imports"] })
      await navigate({
        to: "/recipes/import/$importId",
        params: { importId: made.id },
        replace: true,
      })
    })

  return (
    <>
      <PageHeader
        title={going ? t("recipes.links.adding") : t("recipes.links.finished")}
        description={
          going
            ? t("recipes.links.progress", {
                done: data.done,
                total: data.total,
              })
            : [
                data.added
                  ? t("recipes.links.summaryAdded", { count: data.added })
                  : t("recipes.links.summaryNone"),
                data.already > 0 &&
                  t("recipes.links.summaryAlready", { count: data.already }),
                data.failed > 0 &&
                  t("recipes.links.summaryFailed", { count: data.failed }),
                data.stopped > 0 &&
                  t("recipes.links.summaryStopped", { count: data.stopped }),
              ]
                .filter(Boolean)
                .join(" ")
        }
        actions={
          <>
            {going && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void stop()}
              >
                {t("recipes.links.stop")}
              </Button>
            )}
            {!going && again.length > 0 && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void tryAgain()}
              >
                {t("recipes.links.tryAgain", { count: again.length })}
              </Button>
            )}
            <Button
              variant={going ? "ghost" : "default"}
              render={<Link to="/recipes" search={tagSearch} />}
            >
              {t("recipes.links.toRecipes")}
            </Button>
          </>
        }
      />

      {going && (
        <Progress
          value={(data.done / Math.max(data.total, 1)) * 100}
          className="mb-4"
          aria-label={t("recipes.links.progress", {
            done: data.done,
            total: data.total,
          })}
        />
      )}
      {data.tag && (
        <p className="mb-4 text-sm text-muted-foreground">
          <Trans
            i18nKey="recipes.links.tagged"
            values={{ tag: data.tag }}
            components={{
              link: (
                <Link
                  to="/recipes"
                  search={tagSearch}
                  className="font-medium text-foreground underline underline-offset-4"
                />
              ),
            }}
          />
        </p>
      )}

      <ul className="grid divide-y rounded-3xl border bg-card">
        {data.items.map((item) => (
          <li key={item.url} className="flex items-center gap-3 p-3">
            {item.recipe?.photo ? (
              <img
                src={item.recipe.photo}
                alt=""
                className="size-12 shrink-0 rounded-xl object-cover"
              />
            ) : (
              <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
                {item.state === "adding" ? (
                  <Spinner />
                ) : (
                  <HugeiconsIcon
                    icon={Link01Icon}
                    strokeWidth={2}
                    className="size-5"
                  />
                )}
              </span>
            )}
            <div className="grid min-w-0 flex-1 gap-0.5">
              {item.recipe ? (
                <Link
                  to="/recipes/$slug"
                  params={{ slug: item.recipe.slug }}
                  className="truncate font-medium hover:underline"
                >
                  {item.recipe.name}
                </Link>
              ) : (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate font-medium hover:underline"
                >
                  {linkLabel(item.url)}
                </a>
              )}
              <span
                className={cn(
                  "text-sm text-muted-foreground",
                  item.state === "added" && "text-primary",
                  item.state === "failed" && "text-destructive"
                )}
              >
                {item.state === "failed" && item.error
                  ? item.error
                  : t(`recipes.links.state.${item.state}`)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}
