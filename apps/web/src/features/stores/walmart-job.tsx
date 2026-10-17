import {
  Alert02Icon,
  LinkSquare02Icon,
  ShoppingCartCheck01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { WalmartJob } from "@merran/shared"
import { useTranslation } from "react-i18next"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"

/**
 * How the extension's Walmart job is going: what it's on, Walmart's check
 * that it's a person for the person to finish, and what happened at the end.
 */
export function WalmartJobCard({
  job,
  cartUrl,
  onShowTab,
  onStop,
  onCarryOn,
  onDismiss,
}: {
  job: WalmartJob
  cartUrl: string
  onShowTab: () => void
  onStop: () => void
  onCarryOn: () => void
  onDismiss: () => void
}) {
  const { t } = useTranslation()
  const fill = job.kind === "fill"
  const showTab = (
    <Button variant="outline" size="sm" onClick={onShowTab}>
      {t("stores.walmart.job.showTab")}
    </Button>
  )

  if (job.state === "running") {
    return (
      <div className="grid gap-3 rounded-2xl border p-4" role="status">
        <div className="flex items-center gap-2">
          <Spinner />
          <p className="min-w-0 flex-1 truncate font-medium">
            {job.now
              ? t(
                  fill
                    ? "stores.walmart.job.adding"
                    : "stores.walmart.job.finding",
                  {
                    name: job.now,
                  }
                )
              : t("stores.walmart.job.starting")}
          </p>
          <span className="text-sm text-muted-foreground tabular-nums">
            {t("stores.walmart.job.progress", {
              done: job.done,
              total: job.total,
            })}
          </span>
        </div>
        <Progress
          value={job.total > 0 ? (job.done / job.total) * 100 : 0}
          aria-label={t("stores.walmart.job.progress", {
            done: job.done,
            total: job.total,
          })}
        />
        <p className="text-sm text-muted-foreground">
          {t("stores.walmart.job.beside")}
        </p>
        <div className="flex flex-wrap gap-2">
          {showTab}
          <Button
            variant="ghost"
            size="sm"
            disabled={job.stopping}
            onClick={onStop}
          >
            {job.stopping
              ? t("stores.walmart.job.stopping")
              : t("stores.walmart.job.stop")}
          </Button>
        </div>
      </div>
    )
  }

  if (job.state === "check") {
    return (
      <Alert>
        <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} />
        <AlertTitle>{t("stores.walmart.job.checkTitle")}</AlertTitle>
        <AlertDescription>
          <p>{t("stores.walmart.job.checkText")}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" onClick={onShowTab}>
              {t("stores.walmart.job.showTab")}
            </Button>
            <Button variant="outline" size="sm" onClick={onCarryOn}>
              {t("stores.walmart.job.carryOn")}
            </Button>
            <Button variant="ghost" size="sm" onClick={onDismiss}>
              {t("stores.walmart.job.stop")}
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    )
  }

  if (job.state === "stopped" || job.state === "failed") {
    return (
      <Alert variant={job.state === "failed" ? "destructive" : "default"}>
        <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} />
        <AlertTitle>
          {job.state === "failed"
            ? t("stores.walmart.job.failedTitle")
            : t("stores.walmart.job.stoppedTitle")}
        </AlertTitle>
        <AlertDescription>
          <p>
            {job.error ??
              t("stores.walmart.job.stoppedText", {
                done: job.done,
                total: job.total,
              })}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {job.state === "stopped" && (
              <Button size="sm" onClick={onCarryOn}>
                {t("stores.walmart.job.carryOn")}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onDismiss}>
              {t("stores.walmart.job.dismiss")}
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    )
  }

  // Done.
  return (
    <div
      className="grid gap-3 rounded-2xl border bg-muted/40 p-4"
      role="status"
    >
      <div className="flex items-start gap-3">
        <HugeiconsIcon
          icon={ShoppingCartCheck01Icon}
          strokeWidth={2}
          className="mt-0.5 shrink-0 text-primary"
        />
        <div className="grid gap-1">
          <p className="font-medium">
            {fill
              ? t("stores.walmart.job.filled", { count: job.added.length })
              : t("stores.walmart.job.found", {
                  count: job.done - job.skipped.length,
                })}
          </p>
          <p className="text-sm text-muted-foreground">
            {fill
              ? t("stores.walmart.job.filledText")
              : t("stores.walmart.job.foundText")}
          </p>
        </div>
      </div>
      {fill && job.added.length > 0 && (
        <ul className="grid gap-1 text-sm sm:pl-9">
          {job.added.map((one, i) => (
            <li key={i} className="flex justify-between gap-3">
              <span className="min-w-0 truncate">{one.name}</span>
              <span className="text-muted-foreground tabular-nums">
                {t("stores.walmart.job.packages", { count: one.packages })}
              </span>
            </li>
          ))}
        </ul>
      )}
      {job.skipped.length > 0 && (
        <div className="grid gap-1 text-sm sm:pl-9">
          <p className="font-medium">{t("stores.walmart.job.skipped")}</p>
          <ul className="grid gap-1">
            {job.skipped.map((one, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span className="min-w-0 truncate">{one.name}</span>
                <span className="text-muted-foreground">
                  {t(`stores.walmart.job.why.${one.why}`)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap gap-2 sm:pl-9">
        {fill && (
          <Button
            size="sm"
            render={<a href={cartUrl} target="_blank" rel="noreferrer" />}
          >
            <HugeiconsIcon
              icon={LinkSquare02Icon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            {t("stores.walmart.job.openCart")}
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={onDismiss}>
          {t("stores.walmart.job.dismiss")}
        </Button>
      </div>
    </div>
  )
}
