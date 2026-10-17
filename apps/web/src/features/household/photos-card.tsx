import { useQuery, useQueryClient } from "@tanstack/react-query"
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
import { photoLibraryQuery } from "@/features/recipes/ai-photos"
import { api, ApiError, unwrap } from "@/lib/api/client"
import { cn } from "@/lib/utils"

const STYLES = ["marble", "rustic", "bright", "moody"] as const
type Style = (typeof STYLES)[number]

/** A swatch of each style's colors: the surface, then the dish. */
const SWATCHES: Record<Style, [string, string]> = {
  marble: ["#f1efea", "#2b2b2b"],
  rustic: ["#8a6440", "#d9c4a3"],
  bright: ["#f6f3ec", "#ffffff"],
  moody: ["#1d1d1f", "#4b4f55"],
}

/**
 * AI photos for the household: how they look, all alike so the library
 * looks like one cookbook, and making them for every recipe without one.
 */
export function PhotosCard() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const on = useCapability("photos")
  const { data } = useQuery({ ...photoLibraryQuery, enabled: on })
  const [busy, setBusy] = React.useState<"run" | Style | null>(null)
  if (!on || !data) return null
  const run = data.run
  const going = run !== null && ["queued", "running"].includes(run.status)

  async function refresh() {
    await queryClient.invalidateQueries({
      queryKey: photoLibraryQuery.queryKey,
    })
  }

  async function pick(style: Style) {
    setBusy(style)
    try {
      await unwrap(
        api.PATCH("/api/settings/household", {
          body: { "photos.style": style },
        })
      )
      await refresh()
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    } finally {
      setBusy(null)
    }
  }

  async function act() {
    setBusy("run")
    try {
      if (going && run) {
        await unwrap(
          api.POST("/api/recipes/photos/{runId}/stop", {
            params: { path: { runId: run.id } },
          })
        )
      } else {
        await unwrap(api.POST("/api/recipes/photos", {}))
      }
      await refresh()
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.household.photos.title")}</CardTitle>
        <CardDescription>
          {t("settings.household.photos.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5 text-sm">
        <div
          className="grid gap-2 sm:grid-cols-2"
          role="radiogroup"
          aria-label={t("settings.household.photos.style")}
        >
          {STYLES.map((style) => {
            const chosen = data.style === style
            const [surface, dish] = SWATCHES[style]
            return (
              <button
                key={style}
                type="button"
                role="radio"
                aria-checked={chosen}
                disabled={busy !== null}
                onClick={() => void pick(style)}
                className={cn(
                  "flex items-start gap-3 rounded-2xl border p-3 text-left transition-colors outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  chosen && "border-primary bg-primary/5"
                )}
              >
                <span
                  aria-hidden
                  className="relative mt-0.5 size-9 shrink-0 rounded-full border"
                  style={{ background: surface }}
                >
                  <span
                    className="absolute inset-2 rounded-full border border-black/10"
                    style={{ background: dish }}
                  />
                </span>
                <span className="grid gap-0.5">
                  <span className="flex items-center gap-2 font-medium">
                    {t(`settings.household.photos.styles.${style}.name`)}
                    {busy === style && <Spinner className="size-3.5" />}
                  </span>
                  <span className="text-muted-foreground">
                    {t(`settings.household.photos.styles.${style}.hint`)}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
        {!data.ready && (
          <p className="text-muted-foreground">
            {t("settings.household.photos.noKey")}
          </p>
        )}
        {going && run ? (
          <div className="grid gap-2">
            <Progress value={run.total ? (run.done / run.total) * 100 : 0} />
            <p className="text-muted-foreground">
              {t("settings.household.photos.going", {
                done: run.done,
                total: run.total,
              })}
            </p>
          </div>
        ) : (
          data.ready && (
            <div className="grid gap-1">
              <p>
                {data.missing > 0
                  ? t("settings.household.photos.missing", {
                      count: data.missing,
                    })
                  : t("settings.household.photos.allDone")}
              </p>
              {run && (
                <p className="text-muted-foreground">
                  {run.stopped ??
                    t("settings.household.photos.lastRun", {
                      count: run.made,
                    })}
                </p>
              )}
            </div>
          )
        )}
      </CardContent>
      {data.ready && (going || data.missing > 0) && (
        <CardFooter className="mt-4 justify-end">
          <Button
            variant={going ? "outline" : "default"}
            disabled={busy !== null}
            onClick={() => void act()}
          >
            {busy === "run" && <Spinner />}
            {going
              ? t("settings.household.photos.stop")
              : t("settings.household.photos.start", { count: data.missing })}
          </Button>
        </CardFooter>
      )}
    </Card>
  )
}
