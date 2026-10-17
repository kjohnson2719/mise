import {
  Camera01Icon,
  Cancel01Icon,
  File02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { FileUIPart } from "ai"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { api, ApiError, unwrap } from "@/lib/api/client"
import { shrinkPhoto } from "@/lib/shrink-photo"
import { cn } from "@/lib/utils"

// Photos and PDFs to send the assistant: what's in the pan, or a recipe to
// draft. Each is uploaded as soon as it's added, so sending is quick.

/** The most files one message has. */
export const MAX_FILES = 4

/** What can be added: photos, and PDFs. */
export const ACCEPT = "image/*,application/pdf"

/** The server keeps photos at about this size for the model. */
const MAX_SIDE = 1600

const MAX_PDF_BYTES = 10_000_000

const FILE_URL = /^\/api\/assistant\/files\/([a-f0-9]{24})$/

/** A file's id, from a message's file part. */
export const fileIdOf = (url: string) => FILE_URL.exec(url)?.[1] ?? null

const isPdf = (type: string) => type === "application/pdf"

/** A file added to the next message. */
export type Attached = {
  key: string
  name: string
  pdf: boolean
  /** Shown while it's on its way, and to preview. */
  preview: string
  /** Once it's uploaded. */
  url: string | null
}

/** Deletes a file that was uploaded but won't be sent. */
function forget(file: Attached) {
  const id = file.url ? fileIdOf(file.url) : null
  if (!id) return
  void api
    .DELETE("/api/assistant/files/{fileId}", {
      params: { path: { fileId: id } },
    })
    .catch(() => {})
}

/** Files added for the next message: adding, removing, and sending them. */
export function useAttachments() {
  const { t } = useTranslation()
  const [files, setFiles] = React.useState<Attached[]>([])

  // Their previews go when they do, and files never sent aren't kept.
  const shown = React.useRef(files)
  shown.current = files
  React.useEffect(
    () => () => {
      for (const file of shown.current) {
        URL.revokeObjectURL(file.preview)
        forget(file)
      }
    },
    []
  )

  function remove(key: string) {
    const file = shown.current.find((f) => f.key === key)
    if (!file) return
    URL.revokeObjectURL(file.preview)
    setFiles((now) => now.filter((f) => f.key !== key))
    forget(file)
  }

  async function upload(key: string, blob: Blob, name: string) {
    const form = new FormData()
    form.append("file", blob, name)
    try {
      const kept = await unwrap(
        api.POST("/api/assistant/files", {
          body: form as unknown as { file?: string },
        })
      )
      // Taken out, or the chat closed, while it was on its way.
      if (!shown.current.some((f) => f.key === key)) {
        forget({ key, name, pdf: false, preview: "", url: kept.url })
        return
      }
      setFiles((now) =>
        now.map((f) => (f.key === key ? { ...f, url: kept.url } : f))
      )
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
      remove(key)
    }
  }

  async function add(picked: readonly File[]) {
    const usable = picked.filter(
      (file) => file.type.startsWith("image/") || isPdf(file.type)
    )
    if (usable.length < picked.length) {
      toast.error(t("assistant.files.notUsable"))
    }
    const room = MAX_FILES - shown.current.length
    if (usable.length > room) {
      toast.error(t("assistant.files.tooMany", { count: MAX_FILES }))
    }
    for (const file of usable.slice(0, Math.max(room, 0))) {
      const pdf = isPdf(file.type)
      if (pdf && file.size > MAX_PDF_BYTES) {
        toast.error(t("assistant.files.pdfTooBig", { name: file.name }))
        continue
      }
      const blob = pdf ? file : await shrinkPhoto(file, MAX_SIDE)
      const key = crypto.randomUUID()
      setFiles((now) => [
        ...now,
        {
          key,
          name: file.name,
          pdf,
          preview: URL.createObjectURL(blob),
          url: null,
        },
      ])
      void upload(key, blob, file.name)
    }
  }

  /** The files as a message's parts, cleared for the next one. */
  function take(): FileUIPart[] {
    const parts = files.flatMap((file): FileUIPart[] =>
      file.url
        ? [
            {
              type: "file",
              mediaType: file.pdf ? "application/pdf" : "image/jpeg",
              url: file.url,
              filename: file.name,
            },
          ]
        : []
    )
    for (const file of files) URL.revokeObjectURL(file.preview)
    setFiles([])
    return parts
  }

  return {
    files,
    add,
    remove,
    take,
    /** Still uploading one. */
    uploading: files.some((file) => file.url === null),
    full: files.length >= MAX_FILES,
  }
}

/** Whether this device can take a photo: a phone's camera, or a webcam. */
export function useCanTakePhoto() {
  const [can, setCan] = React.useState<"phone" | "webcam" | null>(null)
  React.useEffect(() => {
    if (window.matchMedia("(pointer: coarse)").matches) {
      setCan("phone")
      return
    }
    // Only where the browser allows the camera: https, or this computer.
    const devices = navigator.mediaDevices
    if (!devices?.getUserMedia || !devices.enumerateDevices) return
    let live = true
    void devices
      .enumerateDevices()
      .then((all) => {
        if (live && all.some((device) => device.kind === "videoinput")) {
          setCan("webcam")
        }
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])
  return can
}

/** A file to look at, bigger: a photo, or a PDF's pages. */
export type Previewed = { name: string; url: string; pdf: boolean }

/** A photo or PDF, bigger, with a way to open it on its own. */
export function FilePreview({
  file,
  onOpenChange,
}: {
  file: Previewed | null
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  return (
    <Dialog open={file !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] gap-3 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="truncate pr-8">
            {file?.name || t("assistant.files.photo")}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t("assistant.files.previewDescription")}
          </DialogDescription>
        </DialogHeader>
        {file &&
          (file.pdf ? (
            <iframe
              src={file.url}
              title={file.name}
              className="h-[70dvh] w-full rounded-xl border bg-white"
            />
          ) : (
            <img
              src={file.url}
              alt={file.name}
              className="max-h-[75dvh] w-full rounded-xl object-contain"
            />
          ))}
        {file && (
          <a
            href={file.url}
            target="_blank"
            rel="noreferrer"
            className="w-fit text-sm text-muted-foreground underline underline-offset-4"
          >
            {t("assistant.files.openOwn")}
          </a>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** A PDF, as a card with its name. */
function PdfCard({ name, className }: { name: string; className?: string }) {
  const { t } = useTranslation()
  return (
    <span
      className={cn(
        "flex h-16 w-44 items-center gap-2.5 rounded-xl border bg-card px-3 text-left",
        className
      )}
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-destructive/10 text-destructive">
        <HugeiconsIcon icon={File02Icon} strokeWidth={2} className="size-5" />
      </span>
      <span className="grid min-w-0">
        <span className="truncate text-sm font-medium">{name}</span>
        <span className="text-xs text-muted-foreground">
          {t("assistant.files.pdf")}
        </span>
      </span>
    </span>
  )
}

/** Files added to the next message, in the box: tap one to see it. */
export function AttachmentTray({
  files,
  onRemove,
  onPreview,
}: {
  files: readonly Attached[]
  onRemove: (key: string) => void
  onPreview: (file: Previewed) => void
}) {
  const { t } = useTranslation()
  if (files.length === 0) return null
  return (
    <ul className="flex gap-2 overflow-x-auto px-1 pt-1 pb-0.5">
      {files.map((file) => (
        <li key={file.key} className="relative shrink-0">
          <button
            type="button"
            className="block rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            aria-label={t("assistant.files.preview", { name: file.name })}
            onClick={() =>
              onPreview({ name: file.name, url: file.preview, pdf: file.pdf })
            }
          >
            {file.pdf ? (
              <PdfCard name={file.name} />
            ) : (
              <img
                src={file.preview}
                alt=""
                className="size-16 rounded-xl border object-cover"
              />
            )}
          </button>
          {file.url === null && (
            <span className="pointer-events-none absolute inset-0 grid place-items-center rounded-xl bg-background/60">
              <Spinner />
            </span>
          )}
          <Button
            type="button"
            variant="secondary"
            size="icon-xs"
            className="absolute -top-1.5 -right-1.5 rounded-full border shadow-sm"
            aria-label={t("assistant.files.remove", { name: file.name })}
            onClick={() => onRemove(file.key)}
          >
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
          </Button>
        </li>
      ))}
    </ul>
  )
}

/** Files someone sent, in their message: tap one to see it. */
export function SentFiles({
  parts,
  onPreview,
}: {
  parts: readonly FileUIPart[]
  onPreview: (file: Previewed) => void
}) {
  const { t } = useTranslation()
  if (parts.length === 0) return null
  return (
    <div className="ml-auto flex max-w-[85%] flex-wrap justify-end gap-2">
      {parts.map((part) => {
        const pdf = isPdf(part.mediaType)
        const name = part.filename ?? t("assistant.files.photo")
        return (
          <button
            key={part.url}
            type="button"
            className="rounded-2xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            aria-label={t("assistant.files.preview", { name })}
            onClick={() => onPreview({ name, url: part.url, pdf })}
          >
            {pdf ? (
              <PdfCard name={name} />
            ) : (
              <img
                src={part.url}
                alt=""
                loading="lazy"
                className="max-h-48 max-w-48 rounded-2xl border object-cover"
              />
            )}
          </button>
        )
      })}
    </div>
  )
}

/**
 * The webcam, to take a photo on a computer: a phone uses its own camera
 * app instead.
 */
export function CameraDialog({
  open,
  onOpenChange,
  onTaken,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onTaken: (photo: File) => void
}) {
  const { t } = useTranslation()
  const video = React.useRef<HTMLVideoElement>(null)
  const [stream, setStream] = React.useState<MediaStream | null>(null)
  const [failed, setFailed] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    let live = true
    let started: MediaStream | null = null
    setFailed(false)
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((media) => {
        if (!live) {
          for (const track of media.getTracks()) track.stop()
          return
        }
        started = media
        setStream(media)
      })
      .catch(() => {
        if (live) setFailed(true)
      })
    return () => {
      live = false
      for (const track of started?.getTracks() ?? []) track.stop()
      setStream(null)
    }
  }, [open])

  React.useEffect(() => {
    if (video.current) video.current.srcObject = stream
  }, [stream])

  async function take() {
    const frame = video.current
    if (!frame || !frame.videoWidth) return
    const canvas = document.createElement("canvas")
    canvas.width = frame.videoWidth
    canvas.height = frame.videoHeight
    canvas.getContext("2d")!.drawImage(frame, 0, 0)
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.9)
    )
    if (!blob) return
    onTaken(new File([blob], "photo.jpg", { type: "image/jpeg" }))
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("assistant.files.camera")}</DialogTitle>
          <DialogDescription>
            {failed
              ? t("assistant.files.cameraBlocked")
              : t("assistant.files.cameraDescription")}
          </DialogDescription>
        </DialogHeader>
        {!failed && (
          <div className="relative aspect-4/3 overflow-hidden rounded-2xl bg-muted">
            <video
              ref={video}
              autoPlay
              playsInline
              muted
              className="size-full object-cover"
            />
            {!stream && (
              <span className="absolute inset-0 grid place-items-center">
                <Spinner />
              </span>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          {!failed && (
            <Button disabled={!stream} onClick={() => void take()}>
              <HugeiconsIcon
                icon={Camera01Icon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              {t("assistant.files.takeIt")}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
