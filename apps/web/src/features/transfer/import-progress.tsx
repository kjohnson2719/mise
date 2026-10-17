import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import * as React from "react"
import { useTranslation } from "react-i18next"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { CardContent, CardFooter } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"
import { useRefreshRecipes } from "@/features/recipes/queries"
import { api, unwrap } from "@/lib/api/client"

import { householdJobQuery, isActive } from "./queries"

/** What an import job says it did. */
type ImportResult = {
  recipes?: number
  skipped?: number
  /** How many didn't come in, and some of them by name. */
  failed?: number
  failures?: { name: string; error: string }[]
}

/**
 * How an import is getting on, and what it did: for a card's content and
 * footer, in place of its form.
 */
export function ImportProgress({
  jobId,
  onAgain,
}: {
  jobId: string
  onAgain: () => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const refreshRecipes = useRefreshRecipes()
  const { data: job } = useQuery(householdJobQuery(jobId))
  const [stopping, setStopping] = React.useState(false)

  // Once it's finished, the recipes it brought in show everywhere.
  const finished = Boolean(job && !isActive(job))
  const refreshed = React.useRef(false)
  React.useEffect(() => {
    if (!finished || refreshed.current) return
    refreshed.current = true
    void refreshRecipes()
  }, [finished, refreshRecipes])

  async function stop() {
    setStopping(true)
    try {
      queryClient.setQueryData(
        householdJobQuery(jobId).queryKey,
        await unwrap(
          api.POST("/api/households/current/jobs/{jobId}/cancel", {
            params: { path: { jobId } },
          })
        )
      )
    } finally {
      setStopping(false)
    }
  }

  const result = (job?.result ?? null) as ImportResult | null
  const failures = result?.failures ?? []
  const failed = result?.failed ?? 0
  const percent =
    job?.progress && job.progress.total > 0
      ? Math.round((job.progress.done / job.progress.total) * 100)
      : 0

  return (
    <>
      <CardContent className="grid gap-3" aria-live="polite">
        {!job || job.status === "queued" ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner />
            {t("settings.transfer.progress.waiting")}
          </p>
        ) : job.status === "running" ? (
          <>
            <Progress value={percent} />
            <p className="text-sm text-muted-foreground">
              {job.progress
                ? t("settings.transfer.progress.importing", {
                    done: job.progress.done,
                    total: job.progress.total,
                  })
                : t("settings.transfer.progress.waiting")}
            </p>
          </>
        ) : job.status === "done" ? (
          <>
            <p className="text-sm">
              {t("settings.transfer.progress.done", {
                count: result?.recipes ?? 0,
              })}
              {(result?.skipped ?? 0) > 0 &&
                ` ${t("settings.transfer.progress.skipped", {
                  count: result?.skipped ?? 0,
                })}`}
            </p>
            {failed > 0 && (
              <Alert>
                <AlertTitle>
                  {t("settings.transfer.progress.notIn", { count: failed })}
                </AlertTitle>
                <AlertDescription>
                  <ul className="list-disc ps-4">
                    {failures.map((failure, index) => (
                      <li key={index}>
                        <span className="font-medium text-foreground">
                          {failure.name}
                        </span>
                        : {failure.error}
                      </li>
                    ))}
                  </ul>
                  {failed > failures.length && (
                    <p>
                      {t("settings.transfer.progress.more", {
                        count: failed - failures.length,
                      })}
                    </p>
                  )}
                </AlertDescription>
              </Alert>
            )}
          </>
        ) : job.status === "failed" ? (
          <Alert variant="destructive">
            <AlertDescription>
              {t("settings.transfer.progress.failed", { error: job.error })}
            </AlertDescription>
          </Alert>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("settings.transfer.progress.stopped")}
          </p>
        )}
      </CardContent>
      <CardFooter className="gap-2">
        {job && isActive(job) ? (
          <Button
            variant="outline"
            disabled={stopping}
            onClick={() => void stop()}
          >
            {t("settings.transfer.progress.stop")}
          </Button>
        ) : (
          <>
            {job?.status === "done" && (
              <Button onClick={() => void navigate({ to: "/recipes" })}>
                {t("settings.transfer.progress.seeRecipes")}
              </Button>
            )}
            <Button variant="outline" onClick={onAgain}>
              {t("settings.transfer.progress.another")}
            </Button>
          </>
        )}
      </CardFooter>
    </>
  )
}
