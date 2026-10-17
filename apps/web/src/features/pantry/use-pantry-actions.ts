import { useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { listQuery } from "@/features/list/queries"
import { api, ApiError, unwrap, type Schemas } from "@/lib/api/client"

import { pantryQuery, type PantryItem, type PantrySnapshot } from "./queries"

type Changes = Schemas["PantryChanges"]
type Bulk = Schemas["PantryBulk"]

/** How long Undo stays offered. */
const UNDO_MS = 10_000

/**
 * Changes to what's at home, each followed by the pantry loading again.
 * Using things up says so with an Undo that really puts them back.
 */
export function usePantryActions() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  async function run<T>(work: () => Promise<T>): Promise<T | null> {
    try {
      return await work()
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
      return null
    } finally {
      await queryClient.invalidateQueries({ queryKey: pantryQuery.queryKey })
    }
  }

  const restore = (items: PantrySnapshot[]) =>
    run(() => unwrap(api.POST("/api/pantry/restore", { body: { items } })))

  const undoable = (message: string, before: PantrySnapshot[]) =>
    toast.success(message, {
      duration: UNDO_MS,
      action: { label: t("pantry.undo"), onClick: () => void restore(before) },
    })

  return {
    add: (body: Schemas["NewPantryItem"]) =>
      run(() => unwrap(api.POST("/api/pantry/items", { body }))),

    change: (item: PantryItem, changes: Changes) =>
      run(() =>
        unwrap(
          api.PATCH("/api/pantry/items/{itemId}", {
            params: { path: { itemId: item.id } },
            body: changes,
          })
        )
      ),

    async remove(item: PantryItem) {
      const before = await run(() =>
        unwrap(
          api.DELETE("/api/pantry/items/{itemId}", {
            params: { path: { itemId: item.id } },
          })
        )
      )
      if (before) undoable(t("pantry.removed", { name: item.name }), [before])
    },

    /** Several at once; the message says what was done, with Undo. */
    async bulk(
      ids: string[],
      action: Omit<Bulk, "ids">,
      said: (changed: number) => string
    ) {
      const done = await run(() =>
        unwrap(api.POST("/api/pantry/items/bulk", { body: { ids, ...action } }))
      )
      if (!done) return false
      undoable(said(done.changed), done.before)
      return true
    },

    async clear() {
      const done = await run(() => unwrap(api.POST("/api/pantry/clear")))
      if (!done) return
      if (done.before.length === 0) toast(t("pantry.clearedNone"))
      else
        undoable(
          t("pantry.cleared", { count: done.before.length }),
          done.before
        )
    },

    /** Running low: these go on the shopping list. */
    async toList(names: string[]) {
      try {
        for (const text of names) {
          await unwrap(api.POST("/api/list/items", { body: { text } }))
        }
        toast.success(
          names.length === 1
            ? t("pantry.addedToList", { name: names[0] })
            : t("pantry.addedSomeToList", { count: names.length })
        )
        return true
      } catch (err) {
        if (!(err instanceof ApiError)) throw err
        toast.error(err.message)
        return false
      } finally {
        await queryClient.invalidateQueries({ queryKey: listQuery.queryKey })
      }
    },
  }
}
