import { createFileRoute } from "@tanstack/react-router"

import { ReceiptPage } from "@/features/pantry/receipts/receipt-page"

export const Route = createFileRoute("/_app/pantry/receipts/$receiptId")({
  component: function Receipt() {
    const { receiptId } = Route.useParams()
    return <ReceiptPage receiptId={receiptId} />
  },
})
