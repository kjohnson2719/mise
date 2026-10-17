import { useQueryClient, type QueryKey } from "@tanstack/react-query"
import { useRouterState } from "@tanstack/react-router"
import * as React from "react"

import { useMe } from "@/features/auth/use-me"
import { CLIENT_ID } from "@/lib/api/client"

export type Person = { id: string; name: string }

/** Pages that say who else has them open. */
type LivePage = "list" | "plan"

/** The longest wait before trying to connect again. */
const MOST_WAIT_MS = 30_000

/** What to fetch again when something in an area changes. */
const REFRESH: Record<string, QueryKey[]> = {
  plan: [["plan"]],
  list: [["list"]],
  pantry: [["pantry"]],
  // What AI suggests for recipes is in Review.
  recipes: [["recipes"], ["tags"], ["review"]],
  household: [["household"]],
}

const LiveContext = React.createContext<Person[]>([])

/** Who else has this page open: "Jamie is on the list too". */
export function usePeopleHere() {
  return React.useContext(LiveContext)
}

function pageOf(path: string): LivePage | null {
  if (path === "/list" || path.startsWith("/list/")) return "list"
  if (path === "/plan" || path.startsWith("/plan/")) return "plan"
  return null
}

/**
 * Keeps every page live: what someone else changes, or this person on
 * another device, is fetched again as it happens, and the page knows who
 * else has it open. After the connection drops (a phone asleep in a
 * pocket, the server restarting), it connects again and everything is
 * fetched again.
 */
export function LiveUpdates({ children }: { children: React.ReactNode }) {
  const me = useMe()
  const queryClient = useQueryClient()
  const page = useRouterState({
    select: (state) => pageOf(state.location.pathname),
  })
  const [people, setPeople] = React.useState<Person[]>([])

  React.useEffect(() => {
    if (typeof EventSource === "undefined") return
    const query = new URLSearchParams({ client: CLIENT_ID })
    if (page) query.set("page", page)
    const refresh = (keys: QueryKey[]) => {
      for (const queryKey of keys)
        void queryClient.invalidateQueries({ queryKey })
    }
    let source: EventSource | null = null
    let retry: ReturnType<typeof setTimeout> | undefined
    let wait = 1_000
    let opened = false

    function connect() {
      source = new EventSource(`/api/events?${query}`)
      for (const [area, keys] of Object.entries(REFRESH)) {
        source.addEventListener(area, () => refresh(keys))
      }
      source.addEventListener("presence", (message) => {
        const { people } = JSON.parse(message.data) as { people: Person[] }
        setPeople(people.filter((person) => person.id !== me.id))
      })
      source.addEventListener("ready", () => {
        wait = 1_000
        // Back after a gap: catch up on whatever changed meanwhile.
        if (opened) refresh(Object.values(REFRESH).flat())
        opened = true
      })
      // The browser tries again by itself after a dropped connection, but
      // gives up on an error answer (a 502 while the server restarts).
      source.addEventListener("error", () => {
        if (source?.readyState !== EventSource.CLOSED) return
        source.close()
        setPeople([])
        retry = setTimeout(connect, wait)
        wait = Math.min(wait * 2, MOST_WAIT_MS)
      })
    }

    connect()
    return () => {
      clearTimeout(retry)
      source?.close()
      setPeople([])
    }
  }, [page, me.id, queryClient])

  return <LiveContext.Provider value={people}>{children}</LiveContext.Provider>
}
