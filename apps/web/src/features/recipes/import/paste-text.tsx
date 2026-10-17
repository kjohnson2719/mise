import * as React from "react"
import { useTranslation } from "react-i18next"

import { TextField } from "@/components/form/text-field"
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
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { NeedsAi, useAiFor } from "@/features/ai/needs-ai"
import { api, ApiError, unwrap } from "@/lib/api/client"

import type { Recipe } from "../queries"

/**
 * A recipe pasted as text, for the Add a recipe dialog: from an email, a
 * note or a message, read by AI.
 */
export function PasteText({
  onBack,
  onAdded,
  onNavigate,
}: {
  onBack: () => void
  onAdded: (recipe: Recipe) => void
  onNavigate: () => void
}) {
  const { t } = useTranslation()
  const ai = useAiFor("import")
  const [text, setText] = React.useState("")
  const [sourceUrl, setSourceUrl] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [errors, setErrors] = React.useState<{
    text?: string
    sourceUrl?: string
  }>({})

  const canPaste =
    typeof navigator !== "undefined" && Boolean(navigator.clipboard?.readText)

  async function paste() {
    try {
      const pasted = await navigator.clipboard.readText()
      setText((now) => (now.trim() ? `${now}\n${pasted}` : pasted))
      setErrors({})
    } catch {
      // The browser said no; pasting into the box still works.
    }
  }

  async function read() {
    if (!text.trim()) {
      setErrors({ text: t("recipes.import.text.needed") })
      return
    }
    setBusy(true)
    setErrors({})
    try {
      onAdded(
        await unwrap(
          api.POST("/api/recipes/import/text", {
            body: { text, sourceUrl: sourceUrl.trim() || null },
          })
        )
      )
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      setErrors({
        text:
          err.fields.text ?? (err.fields.sourceUrl ? undefined : err.message),
        sourceUrl: err.fields.sourceUrl,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("recipes.import.text.title")}</DialogTitle>
        <DialogDescription>
          {t("recipes.import.text.description")}
        </DialogDescription>
      </DialogHeader>
      {ai.why && <NeedsAi task="import" why={ai.why} onNavigate={onNavigate} />}
      <form
        className="grid min-w-0 gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void read()
        }}
      >
        <Field data-invalid={errors.text ? true : undefined}>
          <div className="flex items-center justify-between gap-2">
            <FieldLabel htmlFor="import-text">
              {t("recipes.import.text.label")}
            </FieldLabel>
            {canPaste && (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => void paste()}
              >
                {t("recipes.import.text.paste")}
              </Button>
            )}
          </div>
          <Textarea
            id="import-text"
            autoFocus
            rows={8}
            maxLength={50_000}
            className="max-h-[40dvh] min-h-40"
            placeholder={t("recipes.import.text.placeholder")}
            value={text}
            disabled={busy}
            aria-invalid={errors.text ? true : undefined}
            onChange={(event) => {
              setText(event.target.value)
              setErrors({})
            }}
          />
          {errors.text ? (
            <FieldError>{errors.text}</FieldError>
          ) : (
            busy && (
              <FieldDescription aria-live="polite">
                {t("recipes.import.ai.slow")}
              </FieldDescription>
            )
          )}
        </Field>
        <TextField
          label={t("recipes.import.text.source")}
          description={t("recipes.import.text.sourceHint")}
          type="url"
          inputMode="url"
          placeholder="https://"
          value={sourceUrl}
          disabled={busy}
          error={errors.sourceUrl}
          onChange={(event) => {
            setSourceUrl(event.target.value)
            setErrors({})
          }}
        />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onBack}>
            {t("recipes.import.ai.back")}
          </Button>
          <Button type="submit" disabled={busy || ai.ready === false}>
            {busy && <Spinner data-icon="inline-start" />}
            {busy
              ? t("recipes.import.ai.reading")
              : t("recipes.import.text.submit")}
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}
