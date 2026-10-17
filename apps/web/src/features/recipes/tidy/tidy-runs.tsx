import { costPerUse, parseModelRef } from "@merran/shared"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"
import { formatMoney, householdAiQuery } from "@/features/ai/queries"
import { useCapability } from "@/features/capabilities/queries"
import { api, ApiError, unwrap } from "@/lib/api/client"

import { useRefreshRecipes } from "../queries"
import {
  reviewCountQuery,
  runGoing,
  tidyRunsQuery,
  useRefreshReview,
  type TidyRun,
} from "./queries"

/**
 * On Recipes: a tidy up run going, or suggestions waiting, with the way
 * to Review. Nothing when there's neither, or no AI.
 */
export function ReviewBanner() {
  const { t } = useTranslation()
  const aiOn = useCapability("ai")
  const runs = useQuery({ ...tidyRunsQuery, enabled: aiOn })
  const waiting = useQuery({ ...reviewCountQuery, enabled: aiOn })
  const going = runGoing(runs.data?.runs)
  useRefreshWhenDone(going)

  if (!going && !waiting.data) return null
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-sm">
      {going && <Spinner />}
      <span className="min-w-0 flex-1" aria-live="polite">
        {going
          ? t("recipes.tidy.runs.banner", {
              done: going.done,
              total: going.total,
              count: going.total,
            })
          : t("recipes.tidy.waiting", { count: waiting.data ?? 0 })}
      </span>
      <Button
        variant="outline"
        size="sm"
        render={<Link to="/recipes/review" />}
      >
        {t("recipes.tidy.review")}
      </Button>
    </div>
  )
}

/** When a run finishes, what it suggested shows. */
function useRefreshWhenDone(going: TidyRun | undefined) {
  const refreshReview = useRefreshReview()
  const was = React.useRef(going?.id)
  React.useEffect(() => {
    if (was.current && !going) void refreshReview()
    was.current = going?.id
  }, [going, refreshReview])
}

/** A run: how far it's got, or what it found, and a way to stop it. */
export function TidyRunCard({ run }: { run: TidyRun }) {
  const { t } = useTranslation()
  const refreshReview = useRefreshReview()
  const [stopping, setStopping] = React.useState(false)
  const going = run.status === "queued" || run.status === "running"
  useRefreshWhenDone(going ? run : undefined)

  async function stop() {
    setStopping(true)
    try {
      await unwrap(
        api.POST("/api/recipes/tidy/{runId}/stop", {
          params: { path: { runId: run.id } },
        })
      )
      await refreshReview()
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    } finally {
      setStopping(false)
    }
  }

  return (
    <div className="grid gap-3 rounded-2xl border bg-card p-4 text-sm">
      {going ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span aria-live="polite">
              {t("recipes.tidy.runs.going", {
                done: run.done,
                total: run.total,
                count: run.total,
              })}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={stopping}
              onClick={() => void stop()}
            >
              {stopping && <Spinner data-icon="inline-start" />}
              {t("recipes.tidy.runs.stop")}
            </Button>
          </div>
          <Progress value={run.total ? (run.done / run.total) * 100 : 0} />
        </>
      ) : (
        <p>
          {[
            t("recipes.tidy.runs.done", { count: run.done }),
            run.suggested > 0 &&
              t("recipes.tidy.runs.suggested", { count: run.suggested }),
            run.fine > 0 && t("recipes.tidy.runs.fine", { count: run.fine }),
            run.failed > 0 &&
              t("recipes.tidy.runs.failed", { count: run.failed }),
          ]
            .filter(Boolean)
            .join(" ")}
          {run.stopped && (
            <span className="mt-1 block text-muted-foreground">
              {t("recipes.tidy.runs.stopped", { why: run.stopped })}
            </span>
          )}
          {run.status === "cancelled" && !run.stopped && (
            <span className="mt-1 block text-muted-foreground">
              {t("recipes.tidy.runs.cancelled")}
            </span>
          )}
        </p>
      )}
    </div>
  )
}

/**
 * Tidy up every recipe not tidied yet, for a household admin: what it'll
 * cost, roughly, then a run in the background.
 */
export function TidyLibraryButton({ untidied }: { untidied: number }) {
  const { t, i18n } = useTranslation()
  const refreshReview = useRefreshReview()
  const refreshRecipes = useRefreshRecipes()
  const { data: ai } = useQuery(householdAiQuery)
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  // About what a recipe costs, from the model that tidies.
  const tidy = ai?.status.tasks.tidy
  const ref = tidy?.ok ? tidy.ref : null
  const model = ai?.models.find((option) => option.ref === ref)
  const each =
    ref && parseModelRef(ref)?.kind === "endpoint"
      ? 0
      : model?.price
        ? costPerUse(model.price, "tidy")
        : null

  async function start() {
    setBusy(true)
    try {
      await unwrap(api.POST("/api/recipes/tidy", { body: {} }))
      await Promise.all([refreshReview(), refreshRecipes()])
      setOpen(false)
      toast.success(t("recipes.tidy.library.started", { count: untidied }))
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        {t("recipes.tidy.library.button", { count: untidied })}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("recipes.tidy.library.title", { count: untidied })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {[
                t("recipes.tidy.library.description"),
                each !== null &&
                  (each === 0
                    ? t("recipes.tidy.library.free")
                    : t("recipes.tidy.library.cost", {
                        each: formatMoney(each, i18n.language),
                        total: formatMoney(each * untidied, i18n.language),
                      })),
              ]
                .filter(Boolean)
                .join(" ")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => void start()} disabled={busy}>
              {busy && <Spinner />}
              {t("recipes.tidy.library.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
