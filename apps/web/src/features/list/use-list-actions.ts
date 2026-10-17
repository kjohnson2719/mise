import { useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { api, ApiError, unwrap, type Schemas } from "@/lib/api/client"

import { listQuery, type ListItem, type ListItemSnapshot } from "./queries"

type Changes = Schemas["ListItemChanges"]
type Bulk = Schemas["ListBulk"]

/** How long Undo stays offered. */
const UNDO_MS = 10_000

/**
 * Changes to the list, each followed by the list loading again. Taking
 * things off says so with an Undo that really puts them back.
 */
export function useListActions() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: listQuery.queryKey })

  async function run<T>(work: () => Promise<T>): Promise<T | null> {
    try {
      return await work()
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
      return null
    } finally {
      await refresh()
    }
  }

  const restore = (items: ListItemSnapshot[]) =>
    run(() => unwrap(api.POST("/api/list/restore", { body: { items } })))

  /** Says what happened, with Undo putting things back as they were. */
  const undoable = (message: string, before: ListItemSnapshot[]) =>
    toast.success(message, {
      duration: UNDO_MS,
      action: { label: t("list.undo"), onClick: () => void restore(before) },
    })

  /** Shows a change straight away, before the server has it. */
  function showChange(id: string, change: Partial<ListItem>) {
    queryClient.setQueryData(listQuery.queryKey, (list) =>
      list
        ? {
            ...list,
            items: list.items.map((item) =>
              item.id === id ? { ...item, ...change } : item
            ),
          }
        : list
    )
  }

  return {
    add: (body: Schemas["NewListItem"]) =>
      run(() => unwrap(api.POST("/api/list/items", { body }))),

    change: (item: ListItem, changes: Changes) => {
      if (changes.checked !== undefined)
        showChange(item.id, { checked: changes.checked })
      return run(() =>
        unwrap(
          api.PATCH("/api/list/items/{itemId}", {
            params: { path: { itemId: item.id } },
            body: changes,
          })
        )
      )
    },

    async remove(item: ListItem) {
      const before = await run(() =>
        unwrap(
          api.DELETE("/api/list/items/{itemId}", {
            params: { path: { itemId: item.id } },
          })
        )
      )
      if (before) undoable(t("list.removed", { name: item.name }), [before])
    },

    /** Several at once; the message says what was done, with Undo. */
    async bulk(
      ids: string[],
      action: Omit<Bulk, "ids">,
      said: (changed: number) => string
    ) {
      const done = await run(() =>
        unwrap(api.POST("/api/list/items/bulk", { body: { ids, ...action } }))
      )
      if (!done) return false
      if (action.action === "every-week") toast.success(said(done.changed))
      else undoable(said(done.changed), done.before)
      return true
    },

    /** What's checked off (on a list, or all of them) into the pantry. */
    async putAway(list?: string) {
      const done = await run(() =>
        unwrap(
          api.POST("/api/list/put-away", {
            body: list ? { list } : {},
          })
        )
      )
      await queryClient.invalidateQueries({ queryKey: ["pantry"] })
      if (!done) return
      toast.success(
        done.stored > 0
          ? t("list.putAwayDone", { count: done.stored })
          : t("list.putAwayCleared")
      )
    },

    /** This is the same food as another thing on the list, from now on. */
    async sameAs(item: ListItem, other: ListItem) {
      const done = await run(() =>
        unwrap(
          api.POST("/api/list/items/{itemId}/same-as", {
            params: { path: { itemId: item.id } },
            body: { item: other.id },
          })
        )
      )
      await queryClient.invalidateQueries({ queryKey: ["list", "foods"] })
      if (!done) return false
      toast.success(
        t("list.sameAs.done", { name: item.name, other: other.name })
      )
      return true
    },

    /** Names this line was joined from that are foods of their own. */
    async keepApart(item: ListItem, names: string[]) {
      const done = await run(() =>
        unwrap(
          api.POST("/api/list/items/{itemId}/apart", {
            params: { path: { itemId: item.id } },
            body: { names },
          })
        )
      )
      await queryClient.invalidateQueries({ queryKey: ["list", "foods"] })
      if (!done) return false
      toast.success(t("list.apart.done", { count: done.kept }))
      return true
    },

    /** Forgets one of the household's names for a food. */
    async forget(aliasId: string) {
      await run(() =>
        unwrap(
          api.DELETE("/api/list/foods/{aliasId}", {
            params: { path: { aliasId } },
          })
        )
      )
      await queryClient.invalidateQueries({ queryKey: ["list", "foods"] })
    },

    async clear(which: "checked" | "all") {
      const done = await run(() =>
        unwrap(api.POST("/api/list/clear", { body: { which } }))
      )
      if (!done) return
      if (done.before.length === 0) toast(t("list.clearedNone"))
      else
        undoable(t("list.cleared", { count: done.before.length }), done.before)
    },
  }
}
