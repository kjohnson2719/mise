import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"
import { useCapability } from "@/features/capabilities/queries"
import { api, ApiError, unwrap } from "@/lib/api/client"

// Under ["recipes"], so a run's progress comes in with live updates.
const libraryQuery = queryOptions({
  queryKey: ["recipes", "nutrition"],
  queryFn: () => unwrap(api.GET("/api/recipes/nutrition")),
  refetchInterval: (query) =>
    query.state.data?.run &&
    ["queued", "running"].includes(query.state.data.run.status)
      ? 3000
      : false,
})

/**
 * Nutrition for the whole library, for recipes that came in without it:
 * after moving from Mealie, say.
 */
export function NutritionLibraryCard() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const usda = useCapability("nutrition")
  const ai = useCapability("ai")
  const { data } = useQuery(libraryQuery)
  const [busy, setBusy] = React.useState(false)
  if (!data || (!usda && !ai)) return null
  const run = data.run
  const going = run !== null && ["queued", "running"].includes(run.status)

  async function act() {
    setBusy(true)
    try {
      if (going && run) {
        await unwrap(
          api.POST("/api/recipes/nutrition/{runId}/stop", {
            params: { path: { runId: run.id } },
          })
        )
      } else {
        await unwrap(api.POST("/api/recipes/nutrition", {}))
      }
      await queryClient.invalidateQueries({ queryKey: libraryQuery.queryKey })
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.household.nutrition.title")}</CardTitle>
        <CardDescription>
          {usda
            ? t("settings.household.nutrition.descriptionUsda")
            : t("settings.household.nutrition.descriptionAi")}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        {going && run ? (
          <>
            <Progress value={run.total ? (run.done / run.total) * 100 : 0} />
            <p className="text-muted-foreground">
              {t("settings.household.nutrition.going", {
                done: run.done,
                total: run.total,
              })}
            </p>
          </>
        ) : (
          <>
            <p>
              {data.missing > 0
                ? t("settings.household.nutrition.missing", {
                    count: data.missing,
                  })
                : t("settings.household.nutrition.allDone")}
            </p>
            {data.noServings > 0 && (
              <p className="text-muted-foreground">
                {t("settings.household.nutrition.noServings", {
                  count: data.noServings,
                })}
              </p>
            )}
            {run && (
              <p className="text-muted-foreground">
                {run.stopped ??
                  t("settings.household.nutrition.lastRun", {
                    count: run.workedOut,
                  })}
              </p>
            )}
          </>
        )}
      </CardContent>
      {(going || data.missing > 0) && (
        <CardFooter className="mt-4 justify-end">
          <Button
            variant={going ? "outline" : "default"}
            disabled={busy}
            onClick={() => void act()}
          >
            {busy && <Spinner />}
            {going
              ? t("settings.household.nutrition.stop")
              : t("settings.household.nutrition.start", {
                  count: data.missing,
                })}
          </Button>
        </CardFooter>
      )}
    </Card>
  )
}
