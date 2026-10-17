import { queryOptions } from "@tanstack/react-query"

import { api, unwrap, type Schemas } from "@/lib/api/client"

export type LinkImport = Schemas["LinkImport"]
export type LinkCheck = Schemas["LinkCheck"]

/** Still going: waiting to start, or importing. */
export const isGoing = (linkImport: Pick<LinkImport, "status">) =>
  linkImport.status === "queued" || linkImport.status === "running"

/** One import of several links, checked every second while it's going. */
export const linkImportQuery = (importId: string) =>
  queryOptions({
    queryKey: ["link-imports", importId],
    queryFn: () =>
      unwrap(
        api.GET("/api/recipes/import/links/{importId}", {
          params: { path: { importId } },
        })
      ),
    refetchInterval: (query) =>
      query.state.data && !isGoing(query.state.data) ? false : 1000,
  })

/** The household's imports still going, checked while there are any. */
export const activeLinkImportsQuery = queryOptions({
  queryKey: ["link-imports", "active"],
  queryFn: () => unwrap(api.GET("/api/recipes/import/links")),
  refetchInterval: (query) => (query.state.data?.imports.length ? 2000 : false),
})

/** A link to show: its site and path, without the https://www. */
export function linkLabel(url: string) {
  try {
    const { hostname, pathname } = new URL(url)
    return `${hostname.replace(/^www\./, "")}${pathname === "/" ? "" : pathname}`
  } catch {
    return url
  }
}
