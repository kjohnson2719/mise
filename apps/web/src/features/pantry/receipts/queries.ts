import { queryOptions, useQueryClient } from "@tanstack/react-query"

import { api, unwrap, type Schemas } from "@/lib/api/client"

export type Receipt = Schemas["Receipt"]
export type ReceiptLine = Receipt["lines"][number]

// Under ["pantry"], so a receipt added on another device clears here too.

/** Receipts waiting for a look: shared ones, say. */
export const receiptsQuery = queryOptions({
  queryKey: ["pantry", "receipts"],
  queryFn: () => unwrap(api.GET("/api/pantry/receipts")),
})

export const receiptQuery = (receiptId: string) =>
  queryOptions({
    queryKey: ["pantry", "receipts", receiptId],
    queryFn: () =>
      unwrap(
        api.GET("/api/pantry/receipts/{receiptId}", {
          params: { path: { receiptId } },
        })
      ),
    retry: false,
  })

/** After adding one: the pantry, the list, and what's waiting. */
export function useRefreshAfterReceipt() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["pantry"] }),
      queryClient.invalidateQueries({ queryKey: ["list"] }),
    ])
}
