import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query"
import { useNavigate, useRouter } from "@tanstack/react-router"

import { setSwitchingTo } from "@/features/household/switching"
import { api, unwrap } from "@/lib/api/client"

import { meQuery, type Me } from "./queries"

/**
 * The signed-in person. Only for pages inside the app, where the layout
 * has already made sure someone is signed in.
 */
export function useMe(): Me {
  const { data } = useSuspenseQuery(meQuery)
  if (!data) throw new Error("useMe is only for signed-in pages")
  return data
}

/** The household in use, from the signed-in person's households. */
export function useActiveHousehold() {
  const me = useMe()
  return (
    me.households.find((household) => household.id === me.activeHouseholdId) ??
    me.households[0]
  )
}

/** Forgets everything loaded, and loads it again for the new session or household. */
export function useRefreshAll() {
  const queryClient = useQueryClient()
  const router = useRouter()
  return async () => {
    // Reset, not remove: removing leaves what's on screen holding the old
    // household's data, and nothing tells it to load again.
    await queryClient.resetQueries()
    await router.invalidate()
  }
}

export function useSignOut() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return async () => {
    await unwrap(api.POST("/api/auth/sign-out", { body: {} }))
    queryClient.clear()
    await navigate({ to: "/login" })
  }
}

/**
 * Switches household behind a covering spinner, landing on Today: the page
 * open now may be something only the old household has.
 */
export function useSwitchHousehold() {
  const me = useMe()
  const refreshAll = useRefreshAll()
  const navigate = useNavigate()
  return async (householdId: string) => {
    const household = me.households.find((each) => each.id === householdId)
    setSwitchingTo(household?.name ?? "")
    // Long enough that a quick switch doesn't blink the cover on and off.
    const shown = new Promise((resolve) => setTimeout(resolve, 500))
    try {
      await unwrap(
        api.POST("/api/auth/organization/set-active", {
          body: { organizationId: householdId },
        })
      )
      await navigate({ to: "/" })
      await refreshAll()
      await shown
    } finally {
      setSwitchingTo(null)
    }
  }
}
