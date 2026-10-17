import { ReceiptDollarIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"

import { receiptsQuery } from "./queries"

/** Receipts read and waiting for a look: shared from a phone, say. */
export function WaitingReceipts() {
  const { t } = useTranslation()
  const { data } = useQuery(receiptsQuery)
  const receipts = data?.receipts ?? []
  if (receipts.length === 0) return null
  return (
    <ul className="grid gap-2">
      {receipts.map((receipt) => (
        <li
          key={receipt.id}
          className="flex items-center gap-3 rounded-3xl border bg-card p-3 pl-4"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-muted">
            <HugeiconsIcon icon={ReceiptDollarIcon} strokeWidth={2} />
          </span>
          <span className="grid min-w-0 flex-1">
            <span className="line-clamp-2 font-medium">
              {receipt.store
                ? t("pantry.receipts.waitingFrom", { store: receipt.store })
                : t("pantry.receipts.waiting")}
            </span>
            <span className="text-sm text-muted-foreground">
              {t("pantry.receipts.lines", { count: receipt.lines.length })}
            </span>
          </span>
          <Button
            size="sm"
            render={
              <Link
                to="/pantry/receipts/$receiptId"
                params={{ receiptId: receipt.id }}
              />
            }
          >
            {t("pantry.receipts.lookOver")}
          </Button>
        </li>
      ))}
    </ul>
  )
}
