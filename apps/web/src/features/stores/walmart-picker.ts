import type { ExtensionNo } from "@merran/shared"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { useActiveHousehold } from "@/features/auth/use-me"
import {
  callExtension,
  ExtensionError,
  useExtension,
} from "@/features/extension/bridge"
import { api, unwrap, type Schemas } from "@/lib/api/client"

import type { PickFor } from "./product-search-dialog"
import type { StoreProduct } from "./queries"

/** What the extension said no for, as the person reads it. */
export function useSaidNo() {
  const { t } = useTranslation()
  return (answer: { ok: false; why: ExtensionNo; message?: string } | null) =>
    answer === null
      ? t("stores.walmart.no.noAnswer")
      : (answer.message ?? t(`stores.walmart.no.${answer.why}`))
}

/**
 * Picking a Walmart product for a thing on the list: what Walmart had for
 * it when the extension last looked, a search in the person's Walmart tab
 * through the extension, and the pick, kept for its food. With whether
 * the extension's ready: here, connected to this household, and allowed
 * on walmart.com.
 */
export function useWalmartPicker() {
  const { t } = useTranslation()
  const household = useActiveHousehold()
  const extension = useExtension()
  const saidNo = useSaidNo()
  const status = extension.state === "here" ? extension.status : null
  const connected =
    status?.households.some((one) => one.id === household?.id) ?? false
  const ready = connected && status?.walmart.access === true

  /**
   * Why the extension can't search now, if it can't: asked afresh, as a
   * picker can search the moment it opens, before this page has heard
   * from the extension at all.
   */
  async function cantSearch(householdId: string) {
    const now = await callExtension("status", {}, 2000)
    if (!now) return t("stores.walmart.no.searchSetup")
    if (!now.households.some((one) => one.id === householdId)) {
      return t("stores.walmart.no.household")
    }
    if (!now.walmart.access) return t("stores.walmart.no.access")
    return null
  }

  /** Walmart's search, in the person's Walmart tab, for picking by hand. */
  async function search(words: string): Promise<StoreProduct[] | null> {
    if (!household) return null
    // No extension to search with: say so now, not after waiting for it.
    const cant = await cantSearch(household.id)
    if (cant) throw new ExtensionError(cant)
    const answer = await callExtension(
      "walmart-search",
      { householdId: household.id, words },
      60_000
    )
    if (answer?.ok) return answer.products
    if (answer?.why === "check") {
      toast.warning(t("stores.walmart.no.searchCheck"), {
        action: {
          label: t("stores.walmart.job.showTab"),
          onClick: () => void callExtension("walmart-show", {}),
        },
      })
      return null
    }
    throw new ExtensionError(saidNo(answer))
  }

  /** What Walmart had for it when the extension looked: no Walmart visit. */
  const start = async (line: PickFor) =>
    (
      await unwrap(
        api.GET("/api/stores/walmart/products/{itemId}", {
          params: { path: { itemId: line.itemId } },
        })
      )
    ).products

  const pick = (line: PickFor, product: StoreProduct) =>
    unwrap(
      api.PUT("/api/stores/walmart/products/{itemId}", {
        params: { path: { itemId: line.itemId } },
        body: { product: product as Schemas["WalmartProduct"] },
      })
    )

  return { extension, status, connected, ready, search, start, pick }
}
