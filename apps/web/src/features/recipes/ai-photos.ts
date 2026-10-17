import { queryOptions, useQuery } from "@tanstack/react-query"

import { useCapability } from "@/features/capabilities/queries"
import { api, unwrap } from "@/lib/api/client"

// Under ["recipes"], so a run's progress and new photos come in with live
// updates.
export const photoLibraryQuery = queryOptions({
  queryKey: ["recipes", "photos"],
  queryFn: () => unwrap(api.GET("/api/recipes/photos")),
  refetchInterval: (query) =>
    query.state.data?.run &&
    ["queued", "running"].includes(query.state.data.run.status)
      ? 3000
      : false,
})

/** Whether AI photos can be made for the household now. */
export function useAiPhotos() {
  const on = useCapability("photos")
  const { data } = useQuery({ ...photoLibraryQuery, enabled: on })
  return on && data?.ready === true
}
