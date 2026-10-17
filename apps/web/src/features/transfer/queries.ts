import { queryOptions } from "@tanstack/react-query"

import { api, unwrap, type Schemas } from "@/lib/api/client"

export type Job = Schemas["Job"]

/** Still to finish: waiting or running. */
export const isActive = (job: Pick<Job, "status">) =>
  job.status === "queued" || job.status === "running"

/** One of the household's jobs, checked every second until it's finished. */
export const householdJobQuery = (jobId: string) =>
  queryOptions({
    queryKey: ["jobs", jobId],
    queryFn: () =>
      unwrap(
        api.GET("/api/households/current/jobs/{jobId}", {
          params: { path: { jobId } },
        })
      ),
    refetchInterval: (query) =>
      query.state.data && !isActive(query.state.data) ? false : 1000,
  })
