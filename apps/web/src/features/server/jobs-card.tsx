import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { isActive } from "@/features/transfer/queries"
import { api, ApiError, unwrap, type Schemas } from "@/lib/api/client"

type ServerJob = Schemas["JobListItem"]

export const serverJobsQuery = queryOptions({
  queryKey: ["settings", "server", "jobs"],
  queryFn: () => unwrap(api.GET("/api/settings/server/jobs")),
  // Checked often while something's running.
  refetchInterval: (query) =>
    query.state.data?.jobs.some((job) => job.status === "running" || isDue(job))
      ? 2000
      : 30_000,
})

const isDue = (job: ServerJob) =>
  job.status === "queued" && new Date(job.runAt).getTime() <= Date.now()

/** What each kind of job is, said plainly. */
const KINDS = {
  "household.import": "settings.server.jobs.kinds.import",
  "recipes.importFromApp": "settings.server.jobs.kinds.importFromApp",
  "recipes.purgeDeleted": "settings.server.jobs.kinds.purgeDeleted",
  "jobs.cleanUp": "settings.server.jobs.kinds.cleanUp",
  "telemetry.send": "settings.server.jobs.kinds.telemetry",
  "sites.read": "settings.server.jobs.kinds.readSites",
  "recipes.photos": "settings.server.jobs.kinds.photos",
  "stores.prices": "settings.server.jobs.kinds.prices",
} as const

const BADGES = {
  queued: "secondary",
  running: "default",
  done: "outline",
  failed: "destructive",
  cancelled: "outline",
} as const

/** Settings → This server → Jobs: what Merran's doing in the background. */
export function JobsCard() {
  const { t } = useTranslation()
  const jobs = useQuery(serverJobsQuery)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.server.jobs.title")}</CardTitle>
        <CardDescription>
          {t("settings.server.jobs.description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {jobs.isPending ? (
          <Skeleton className="h-24 rounded-2xl" />
        ) : !jobs.data?.jobs.length ? (
          <p className="text-sm text-muted-foreground">
            {t("settings.server.jobs.none")}
          </p>
        ) : (
          <ul className="max-h-[32rem] divide-y overflow-y-auto rounded-2xl border">
            {jobs.data.jobs.map((job) => (
              <JobRow key={job.id} job={job} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function JobRow({ job }: { job: ServerJob }) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [busy, setBusy] = React.useState(false)
  const when = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: "medium",
    timeStyle: "short",
  })
  const kind = KINDS[job.kind as keyof typeof KINDS]
  const waiting = job.status === "queued" && !isDue(job)

  async function act(action: "retry" | "cancel") {
    setBusy(true)
    try {
      await unwrap(
        action === "retry"
          ? api.POST("/api/settings/server/jobs/{jobId}/retry", {
              params: { path: { jobId: job.id } },
            })
          : api.POST("/api/settings/server/jobs/{jobId}/cancel", {
              params: { path: { jobId: job.id } },
            })
      )
      await queryClient.invalidateQueries({
        queryKey: serverJobsQuery.queryKey,
      })
      toast.success(
        action === "retry"
          ? t("settings.server.jobs.retried")
          : t("settings.server.jobs.stopped")
      )
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      toast.error(error.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-3 p-4">
      <div className="grid min-w-0 flex-1 basis-60 gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{kind ? t(kind) : job.kind}</span>
          <Badge variant={BADGES[job.status]}>
            {t(`settings.server.jobs.status.${job.status}`)}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {[
            job.householdName ?? t("settings.server.jobs.server"),
            waiting
              ? t("settings.server.jobs.next", {
                  when: when.format(new Date(job.runAt)),
                })
              : when.format(new Date(job.finishedAt ?? job.createdAt)),
            job.status === "running" &&
              job.progress &&
              t("settings.server.jobs.progress", {
                done: job.progress.done,
                total: job.progress.total,
              }),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {job.error && job.status !== "done" && (
          <p className="text-sm text-destructive">{job.error}</p>
        )}
      </div>
      {isActive(job) && !(job.scheduled && job.status === "queued") ? (
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => void act("cancel")}
        >
          {t("settings.server.jobs.stop")}
        </Button>
      ) : job.status === "failed" || job.status === "cancelled" ? (
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => void act("retry")}
        >
          {t("settings.server.jobs.retry")}
        </Button>
      ) : null}
    </li>
  )
}
