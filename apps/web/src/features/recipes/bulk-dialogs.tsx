import { useQuery } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { api, ApiError, unwrap, type Schemas } from "@/lib/api/client"

import { tagsQuery, useRefreshRecipes } from "./queries"

type RecipeBulk = Schemas["RecipeBulkInput"]
type DeletedBulk = Schemas["DeletedBulkInput"]

/** Several recipes changed at once, and the pages showing them brought up to date. */
export function useRecipeBulk() {
  const refresh = useRefreshRecipes()
  const [busy, setBusy] = React.useState(false)
  const run = async <T,>(work: () => Promise<T>) => {
    setBusy(true)
    try {
      const result = await work()
      await refresh()
      return result
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      toast.error(error.message)
      return null
    } finally {
      setBusy(false)
    }
  }
  return {
    busy,
    recipes: (body: RecipeBulk) =>
      run(() => unwrap(api.POST("/api/recipes/bulk", { body }))),
    deleted: (body: DeletedBulk) =>
      run(() => unwrap(api.POST("/api/recipes/deleted/bulk", { body }))),
  }
}

/** "Bread, Soup and 3 more". */
function useNamesOf() {
  const { t } = useTranslation()
  return (names: readonly string[]) => {
    const shown = names.slice(0, 3).join(", ")
    return names.length > 3
      ? t("recipes.bulk.andMore", { names: shown, count: names.length - 3 })
      : shown
  }
}

/** Adds tags to the picked recipes, or takes them off. */
export function TagRecipesDialog({
  ids,
  open,
  onOpenChange,
}: {
  ids: readonly string[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const { data: tags = [] } = useQuery(tagsQuery)
  const bulk = useRecipeBulk()
  const [text, setText] = React.useState("")
  const listId = React.useId()
  const names = text
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)

  async function run(action: "addTags" | "removeTags") {
    const result = await bulk.recipes({ action, ids: [...ids], tags: names })
    if (!result) return
    toast.success(
      action === "addTags"
        ? t("recipes.bulk.tagged", { count: result.changed })
        : t("recipes.bulk.untagged", { count: result.changed })
    )
    setText("")
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("recipes.bulk.tagsTitle", { count: ids.length })}
          </DialogTitle>
          <DialogDescription>
            {t("recipes.bulk.tagsDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Input
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={t("recipes.bulk.tagsPlaceholder")}
            list={listId}
            aria-label={t("recipes.fields.tags")}
            autoFocus
          />
          <datalist id={listId}>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.name} />
            ))}
          </datalist>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tags.slice(0, 12).map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() =>
                    setText((current) =>
                      current.trim()
                        ? `${current.replace(/,\s*$/, "")}, ${tag.name}`
                        : tag.name
                    )
                  }
                  className="rounded-full border px-3 py-1 text-sm outline-none hover:bg-secondary focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  {tag.name}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              disabled={names.length === 0 || bulk.busy}
              onClick={() => void run("removeTags")}
            >
              {t("recipes.bulk.takeOff")}
            </Button>
            <Button
              disabled={names.length === 0 || bulk.busy}
              onClick={() => void run("addTags")}
            >
              {bulk.busy && <Spinner data-icon="inline-start" />}
              {t("recipes.bulk.addTo", { count: ids.length })}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** "Delete 4 recipes?": to Recently deleted, with Undo. */
export function DeleteRecipesDialog({
  recipes,
  open,
  onOpenChange,
  onDeleted,
}: {
  recipes: readonly { id: string; name: string }[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted: () => void
}) {
  const { t } = useTranslation()
  const bulk = useRecipeBulk()
  const namesOf = useNamesOf()
  const ids = recipes.map((recipe) => recipe.id)
  const one = recipes.length === 1 ? recipes[0] : undefined

  async function remove() {
    const result = await bulk.recipes({ action: "delete", ids })
    if (!result) return
    onDeleted()
    toast(t("recipes.bulk.deleted", { count: result.changed }), {
      duration: 10_000,
      action: {
        label: t("recipes.undo"),
        onClick: () => void bulk.deleted({ action: "restore", ids }),
      },
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {one
              ? t("recipes.bulk.deleteOne", { name: one.name })
              : t("recipes.bulk.deleteMany", { count: recipes.length })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("recipes.bulk.deleteDescription", { count: recipes.length })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {!one && (
          <p className="text-sm">{namesOf(recipes.map((r) => r.name))}</p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={bulk.busy}
            onClick={() => void remove()}
          >
            {t("recipes.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** "Delete 4 recipes for good?": no way back. */
export function PurgeRecipesDialog({
  recipes,
  open,
  onOpenChange,
  onPurged,
}: {
  recipes: readonly { id: string; name: string }[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onPurged: () => void
}) {
  const { t } = useTranslation()
  const bulk = useRecipeBulk()
  const namesOf = useNamesOf()
  const one = recipes.length === 1 ? recipes[0] : undefined

  async function purge() {
    const result = await bulk.deleted({
      action: "purge",
      ids: recipes.map((recipe) => recipe.id),
    })
    if (!result) return
    onPurged()
    toast.success(t("recipes.bulk.purged", { count: result.changed }))
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {one
              ? t("recipes.bulk.purgeOne", { name: one.name })
              : t("recipes.bulk.purgeMany", { count: recipes.length })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("recipes.bulk.purgeDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {!one && (
          <p className="text-sm">{namesOf(recipes.map((r) => r.name))}</p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={bulk.busy}
            onClick={() => void purge()}
          >
            {t("recipes.bulk.purge")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
