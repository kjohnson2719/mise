import { useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { useHouseholdClock } from "@/features/plan/queries"

import { ProductSearchDialog, type PickFor } from "./product-search-dialog"
import type { BasketLine, YourStore } from "./queries"
import { useWalmartPicker } from "./walmart-picker"

/** A thing on the list being found at one of the household's stores. */
export type Finding = { line: PickFor; store: YourStore }

/**
 * Find at a store Merran can send to, from the list: its product picker
 * for the thing, and the pick kept for its food there, so Send takes it
 * there next time.
 */
export function FindProductDialog({
  finding,
  onClose,
}: {
  finding: Finding | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { today } = useHouseholdClock()

  function picked(line: BasketLine) {
    toast.success(
      t("list.findPicked", {
        product: line.product?.name ?? "",
        name: line.name,
        store: finding?.store.name ?? "",
      })
    )
    void queryClient.invalidateQueries({ queryKey: ["list", "prices"] })
    void queryClient.invalidateQueries({ queryKey: ["stores"] })
  }

  if (finding?.store.key === "walmart") {
    return (
      <WalmartFind
        finding={finding}
        today={today}
        onClose={onClose}
        onPicked={picked}
      />
    )
  }
  return (
    <ProductSearchDialog
      line={finding?.line ?? null}
      store={finding?.store.name ?? ""}
      today={today}
      onOpenChange={(open) => !open && onClose()}
      onPicked={picked}
    />
  )
}

/** Walmart's picker, with the extension looked for only while it's open. */
function WalmartFind({
  finding,
  today,
  onClose,
  onPicked,
}: {
  finding: Finding
  today: string
  onClose: () => void
  onPicked: (line: BasketLine) => void
}) {
  const { t } = useTranslation()
  const walmart = useWalmartPicker()
  return (
    <ProductSearchDialog
      line={finding.line}
      store={finding.store.name}
      today={today}
      onOpenChange={(open) => !open && onClose()}
      onPicked={onPicked}
      search={walmart.search}
      start={walmart.start}
      pick={walmart.pick}
      hint={t("stores.walmart.searchHint")}
    />
  )
}
