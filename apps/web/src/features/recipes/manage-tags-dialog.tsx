import { Delete02Icon, Tag01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/confirm-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { api, ApiError, unwrap } from "@/lib/api/client"

import { tagsQuery, useRefreshRecipes, type Tag } from "./queries"

/** Renaming, merging and deleting the household's tags. */
export function ManageTagsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const { data: tags = [] } = useQuery({ ...tagsQuery, enabled: open })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("recipes.manageTags")}</DialogTitle>
          <DialogDescription>{t("recipes.tagsHint")}</DialogDescription>
        </DialogHeader>
        {tags.length === 0 ? (
          <Empty className="rounded-2xl border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={Tag01Icon} strokeWidth={2} />
              </EmptyMedia>
              <EmptyTitle>{t("recipes.noTags")}</EmptyTitle>
              <EmptyDescription>{t("recipes.noTagsHint")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="max-h-[60vh] divide-y overflow-y-auto rounded-2xl border">
            {tags.map((tag) => (
              <TagRow key={tag.id} tag={tag} />
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}

function TagRow({ tag }: { tag: Tag }) {
  const { t } = useTranslation()
  const refresh = useRefreshRecipes()
  const [name, setName] = React.useState(tag.name)
  const [saving, setSaving] = React.useState(false)
  const changed = name.trim() !== "" && name.trim() !== tag.name

  async function rename(event: React.FormEvent) {
    event.preventDefault()
    if (!changed) return
    setSaving(true)
    try {
      await unwrap(
        api.PATCH("/api/recipes/tags/{tagId}", {
          params: { path: { tagId: tag.id } },
          body: { name: name.trim() },
        })
      )
      await refresh()
      toast.success(t("recipes.tagRenamed", { name: name.trim() }))
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      toast.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    await unwrap(
      api.DELETE("/api/recipes/tags/{tagId}", {
        params: { path: { tagId: tag.id } },
      })
    )
    await refresh()
    toast.success(t("recipes.tagDeleted", { name: tag.name }))
  }

  return (
    <li>
      <form onSubmit={rename} className="flex items-center gap-2 p-3">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-label={t("recipes.tagName", { name: tag.name })}
          className="flex-1"
        />
        <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">
          {t("recipes.count", { count: tag.recipes })}
        </span>
        {changed && (
          <Button type="submit" size="sm" disabled={saving}>
            {saving && <Spinner />}
            {t("common.save")}
          </Button>
        )}
        <ConfirmDialog
          trigger={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("recipes.deleteTag", { name: tag.name })}
            >
              <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
            </Button>
          }
          title={t("recipes.deleteTagTitle", { name: tag.name })}
          description={t("recipes.deleteTagDescription")}
          confirm={t("recipes.deleteTagConfirm")}
          onConfirm={remove}
        />
      </form>
    </li>
  )
}
