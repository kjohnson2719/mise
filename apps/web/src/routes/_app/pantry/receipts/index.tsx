import { createFileRoute } from "@tanstack/react-router"

import { ScanReceiptPage } from "@/features/pantry/receipts/scan-page"

export const Route = createFileRoute("/_app/pantry/receipts/")({
  component: ScanReceiptPage,
})
