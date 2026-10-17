import { Link01Icon, Video01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { api, ApiError, unwrap } from "@/lib/api/client"
import { cn } from "@/lib/utils"

import { linkLabel } from "./link-imports"
import { tagsQuery } from "./queries"

/** The text, once it's stopped changing for a moment. */
function useSettled(text: string, ms = 300) {
  const [settled, setSettled] = React.useState(text)
  React.useEffect(() => {
    const timer = setTimeout(() => setSettled(text), ms)
    return () => clearTimeout(timer)
  }, [text, ms])
  return settled
}

/**
 * Several links at once, for the Add a recipe dialog: pasted any old way,
 * checked against the library, then imported in the background.
 */
export function SeveralLinks({
  onBack,
  onStarted,
}: {
  onBack: () => void
  onStarted: (importId: string) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data: tags = [] } = useQuery(tagsQuery)
  const [text, setText] = React.useState("")
  const [tag, setTag] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const settled = useSettled(text)
  const tagsId = React.useId()

  const check = useQuery({
    queryKey: ["link-check", settled],
    queryFn: () =>
      unwrap(
        api.POST("/api/recipes/import/links/check", {
          body: { text: settled },
        })
      ),
    enabled: settled.trim() !== "",
    placeholderData: keepPreviousData,
  })
  const links = text.trim() ? (check.data?.links ?? []) : []
  const fresh = links.filter((link) => !link.existing && !link.video)
  const have = links.filter((link) => link.existing).length
  const videos = links.filter((link) => !link.existing && link.video).length
  const more = text.trim() ? (check.data?.more ?? 0) : 0

  const canPaste =
    typeof navigator !== "undefined" && Boolean(navigator.clipboard?.readText)

  async function paste() {
    try {
      const pasted = await navigator.clipboard.readText()
      setText((now) => (now.trim() ? `${now}\n${pasted}` : pasted))
    } catch {
      // The browser said no; pasting into the box still works.
    }
  }

  async function start() {
    setBusy(true)
    setError(null)
    try {
      const made = await unwrap(
        api.POST("/api/recipes/import/links", {
          body: {
            urls: fresh.map((link) => link.url),
            tag: tag.trim() || null,
          },
        })
      )
      await queryClient.invalidateQueries({ queryKey: ["link-imports"] })
      onStarted(made.id)
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      setError(err.fields.urls ?? err.message)
    } finally {
      setBusy(false)
    }
  }

  const summary = [
    fresh.length
      ? t("recipes.links.new", { count: fresh.length })
      : t("recipes.links.nothingNew"),
    have > 0 && t("recipes.links.have", { count: have }),
    videos > 0 && t("recipes.links.videos", { count: videos }),
    more > 0 && t("recipes.links.more"),
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("recipes.links.title")}</DialogTitle>
        <DialogDescription>{t("recipes.links.description")}</DialogDescription>
      </DialogHeader>
      <form
        className="grid min-w-0 gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          if (fresh.length > 0) void start()
        }}
      >
        <Field data-invalid={error ? true : undefined}>
          <div className="flex items-center justify-between gap-2">
            <FieldLabel htmlFor="import-links">
              {t("recipes.links.label")}
            </FieldLabel>
            {canPaste && (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => void paste()}
              >
                {t("recipes.links.paste")}
              </Button>
            )}
          </div>
          <Textarea
            id="import-links"
            autoFocus
            rows={5}
            className="max-h-[30dvh] min-h-28"
            placeholder={t("recipes.links.placeholder")}
            value={text}
            aria-invalid={error ? true : undefined}
            onChange={(event) => {
              setText(event.target.value)
              setError(null)
            }}
          />
          {error ? (
            <FieldError>{error}</FieldError>
          ) : (
            <FieldDescription aria-live="polite">
              {links.length > 0 ? summary : t("recipes.links.hint")}
            </FieldDescription>
          )}
        </Field>

        {links.length > 0 && (
          <ul className="grid max-h-44 gap-0.5 overflow-y-auto rounded-2xl border p-1.5">
            {links.map((link) => {
              const skipped = Boolean(link.existing) || link.video
              return (
                <li
                  key={link.url}
                  className={cn(
                    "flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-sm",
                    skipped && "text-muted-foreground"
                  )}
                >
                  <HugeiconsIcon
                    icon={link.video ? Video01Icon : Link01Icon}
                    strokeWidth={2}
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate",
                      skipped && "line-through"
                    )}
                  >
                    {linkLabel(link.url)}
                  </span>
                  {link.existing ? (
                    <span className="shrink-0 text-xs">
                      {t("recipes.links.haveIt")}
                    </span>
                  ) : (
                    link.video && (
                      <span className="shrink-0 text-xs">
                        {t("recipes.links.video")}
                      </span>
                    )
                  )}
                </li>
              )
            })}
          </ul>
        )}

        <Field>
          <FieldLabel htmlFor="import-links-tag">
            {t("recipes.links.tag")}
          </FieldLabel>
          <Input
            id="import-links-tag"
            list={tagsId}
            maxLength={40}
            placeholder={t("recipes.links.tagPlaceholder")}
            value={tag}
            onChange={(event) => setTag(event.target.value)}
          />
          <datalist id={tagsId}>
            {tags.map((option) => (
              <option key={option.name} value={option.name} />
            ))}
          </datalist>
        </Field>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onBack}>
            {t("recipes.links.oneLink")}
          </Button>
          <Button type="submit" disabled={fresh.length === 0 || busy}>
            {busy && <Spinner data-icon="inline-start" />}
            {fresh.length
              ? t("recipes.links.import", { count: fresh.length })
              : t("recipes.links.importNone")}
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}
