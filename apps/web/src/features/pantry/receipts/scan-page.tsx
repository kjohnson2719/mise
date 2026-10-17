import {
  ArrowLeft01Icon,
  Camera01Icon,
  File01Icon,
  TextIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import * as React from "react"
import { useTranslation } from "react-i18next"

import { PageHeader } from "@/components/layout/page-header"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { NeedsAi, useAiFor } from "@/features/ai/needs-ai"
import { CameraDialog, useCanTakePhoto } from "@/features/assistant/attachments"
import { useRefreshRecipes } from "@/features/recipes/queries"
import { api, ApiError, unwrap } from "@/lib/api/client"
import { shrinkPhoto } from "@/lib/shrink-photo"
import { cn } from "@/lib/utils"

import { receiptQuery } from "./queries"

/** What was sent to read: files, or pasted text. */
type Sent = { files: File[] } | { text: string }

/** Receipts are read across: a tall screenshot keeps its print. */
const MAX_WIDTH = 1600

const isPdf = (file: File) => file.type === "application/pdf"

/**
 * Scan a receipt into the pantry: a photo, screenshots, a PDF or pasted
 * text. Once it's read, it's looked over on its own page.
 */
export function ScanReceiptPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const refreshRecipes = useRefreshRecipes()
  const ai = useAiFor("receipts")
  const canTakePhoto = useCanTakePhoto()
  const camera = React.useRef<HTMLInputElement>(null)
  const picker = React.useRef<HTMLInputElement>(null)
  const [webcam, setWebcam] = React.useState(false)
  const [pasting, setPasting] = React.useState(false)
  const [text, setText] = React.useState("")
  const [reading, setReading] = React.useState(false)
  const [adding, setAdding] = React.useState(false)
  const [over, setOver] = React.useState(false)
  const [failed, setFailed] = React.useState<{
    message: string
    recipe: boolean
    sent: Sent
  } | null>(null)

  async function read(sent: Sent) {
    if ("files" in sent && sent.files.length === 0) return
    setReading(true)
    setFailed(null)
    const form = new FormData()
    if ("files" in sent) {
      for (const file of sent.files) {
        const body = isPdf(file)
          ? file
          : await shrinkPhoto(file, MAX_WIDTH, "width")
        form.append("file", body, file.name)
      }
    } else {
      form.append("text", sent.text)
    }
    try {
      const receipt = await unwrap(
        api.POST("/api/pantry/receipts", {
          body: form as unknown as { text?: string },
        })
      )
      queryClient.setQueryData(receiptQuery(receipt.id).queryKey, receipt)
      await navigate({
        to: "/pantry/receipts/$receiptId",
        params: { receiptId: receipt.id },
      })
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      setFailed({
        message: err.message,
        recipe: err.code === "receipt_is_recipe",
        sent,
      })
    } finally {
      setReading(false)
    }
  }

  /** It was a recipe after all: add it as one. */
  async function addRecipe(sent: Sent) {
    setAdding(true)
    try {
      let recipe: { slug: string; name: string }
      if ("files" in sent) {
        const form = new FormData()
        for (const file of sent.files.slice(0, 4)) {
          form.append(
            "photos",
            isPdf(file) ? file : await shrinkPhoto(file, 2000),
            file.name
          )
        }
        recipe = await unwrap(
          api.POST("/api/recipes/import/photos", {
            body: form as unknown as { photos?: string[] },
          })
        )
      } else {
        recipe = await unwrap(
          api.POST("/api/recipes/import/text", { body: { text: sent.text } })
        )
      }
      await refreshRecipes()
      await navigate({ to: "/recipes/$slug", params: { slug: recipe.slug } })
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      setFailed({ message: err.message, recipe: false, sent })
    } finally {
      setAdding(false)
    }
  }

  const pick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = [...(event.target.files ?? [])]
    event.target.value = ""
    void read({ files: chosen })
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="mt-2 -ml-3 md:mt-4"
        render={<Link to="/pantry" />}
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
        {t("nav.pantry")}
      </Button>
      <PageHeader
        title={t("pantry.receipts.scan")}
        description={t("pantry.receipts.description")}
      />

      {ai.why ? (
        <NeedsAi task="receipts" why={ai.why} />
      ) : reading ? (
        <div className="grid max-w-2xl gap-3" aria-live="polite">
          <p className="flex items-center gap-2 text-muted-foreground">
            <Spinner /> {t("pantry.receipts.reading")}
          </p>
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-16 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid max-w-2xl gap-4">
          <div
            className={cn(
              "grid gap-3 rounded-3xl sm:grid-cols-3",
              over && "ring-2 ring-primary ring-offset-4 ring-offset-background"
            )}
            onDragOver={(event) => {
              event.preventDefault()
              setOver(true)
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(event) => {
              event.preventDefault()
              setOver(false)
              void read({ files: [...event.dataTransfer.files] })
            }}
          >
            {canTakePhoto && (
              <Choice
                icon={Camera01Icon}
                title={t("pantry.receipts.photo")}
                detail={t("pantry.receipts.photoDetail")}
                onClick={() =>
                  canTakePhoto === "phone"
                    ? camera.current?.click()
                    : setWebcam(true)
                }
              />
            )}
            <Choice
              icon={File01Icon}
              title={t("pantry.receipts.files")}
              detail={t("pantry.receipts.filesDetail")}
              onClick={() => picker.current?.click()}
            />
            <Choice
              icon={TextIcon}
              title={t("pantry.receipts.paste")}
              detail={t("pantry.receipts.pasteDetail")}
              onClick={() => setPasting(true)}
            />
          </div>
          <input
            ref={camera}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={pick}
          />
          <input
            ref={picker}
            type="file"
            accept="image/*,application/pdf"
            multiple
            hidden
            onChange={pick}
          />
          {pasting && (
            <form
              className="grid gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                if (text.trim()) void read({ text })
              }}
            >
              <Textarea
                value={text}
                rows={8}
                autoFocus
                maxLength={50_000}
                placeholder={t("pantry.receipts.pastePlaceholder")}
                aria-label={t("pantry.receipts.paste")}
                onChange={(event) => setText(event.target.value)}
              />
              <Button
                type="submit"
                className="justify-self-start"
                disabled={text.trim().length < 10}
              >
                {t("pantry.receipts.readIt")}
              </Button>
            </form>
          )}
          {failed && (
            <Alert>
              <AlertDescription className="grid justify-items-start gap-3">
                <p>{failed.message}</p>
                {failed.recipe && (
                  <Button
                    size="sm"
                    disabled={adding}
                    onClick={() => void addRecipe(failed.sent)}
                  >
                    {adding && <Spinner data-icon="inline-start" />}
                    {t("pantry.receipts.addRecipe")}
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          )}
          <p className="text-sm text-muted-foreground">
            {t("pantry.receipts.shareHint")}
          </p>
        </div>
      )}
      <CameraDialog
        open={webcam}
        onOpenChange={setWebcam}
        onTaken={(photo) => void read({ files: [photo] })}
      />
    </>
  )
}

function Choice({
  icon,
  title,
  detail,
  onClick,
}: {
  icon: typeof Camera01Icon
  title: string
  detail: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-3xl border bg-card p-4 text-left transition-colors outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 sm:grid sm:justify-items-start sm:gap-2"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-muted">
        <HugeiconsIcon icon={icon} strokeWidth={2} />
      </span>
      <span className="grid gap-0.5">
        <span className="font-medium">{title}</span>
        <span className="text-sm text-muted-foreground">{detail}</span>
      </span>
    </button>
  )
}
