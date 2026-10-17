import { ArrowLeft01Icon, File02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { PageHeader } from "@/components/layout/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { FilePreview, type Previewed } from "@/features/assistant/attachments"
import { householdQuery } from "@/features/household/queries"
import { api, ApiError, unwrap } from "@/lib/api/client"
import { cn } from "@/lib/utils"

import {
  receiptQuery,
  useRefreshAfterReceipt,
  type Receipt,
  type ReceiptLine,
} from "./queries"

const DAY = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
})

/** Prices, in the household's currency. */
function useMoney() {
  const { data } = useQuery(householdQuery)
  const currency = data?.currency ?? "USD"
  return (value: number) =>
    value.toLocaleString(undefined, { style: "currency", currency })
}

/** A receipt read and waiting: look it over, then add it to the pantry. */
export function ReceiptPage({ receiptId }: { receiptId: string }) {
  const { t } = useTranslation()
  const { data, error, isPending } = useQuery(receiptQuery(receiptId))

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
      {data ? (
        <Review receipt={data} />
      ) : isPending ? (
        <div className="grid max-w-2xl gap-3 pt-6">
          <Skeleton className="h-9 w-56" />
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          <PageHeader title={t("pantry.receipts.title")} />
          <div className="grid justify-items-start gap-3">
            <p className="text-muted-foreground">
              {error instanceof ApiError
                ? error.message
                : t("status.error.description")}
            </p>
            <Button variant="outline" render={<Link to="/pantry/receipts" />}>
              {t("pantry.receipts.scanAnother")}
            </Button>
          </div>
        </>
      )}
    </>
  )
}

type Choice = { on: boolean; name: string; amount: string }

/** Every line, food ticked; names and amounts can be fixed before adding. */
function Review({ receipt }: { receipt: Receipt }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const money = useMoney()
  const refresh = useRefreshAfterReceipt()
  const [busy, setBusy] = React.useState<"add" | "discard" | null>(null)
  const [previewed, setPreviewed] = React.useState<Previewed | null>(null)
  const [choices, setChoices] = React.useState<Record<string, Choice>>(() =>
    Object.fromEntries(
      receipt.lines.map((line) => [
        line.id,
        {
          on: line.kind === "food",
          name: line.name,
          amount: line.amount ?? "",
        },
      ])
    )
  )
  const chosen = receipt.lines.filter(
    (line) => choices[line.id]?.on && choices[line.id]!.name.trim()
  )
  const offTheList = chosen.filter((line) => line.listItem).length
  const change = (id: string, next: Partial<Choice>) =>
    setChoices((now) => ({ ...now, [id]: { ...now[id]!, ...next } }))
  const allOn = receipt.lines.every((line) => choices[line.id]?.on)

  async function add() {
    setBusy("add")
    try {
      const result = await unwrap(
        api.POST("/api/pantry/receipts/{receiptId}/add", {
          params: { path: { receiptId: receipt.id } },
          body: {
            items: chosen.map((line) => ({
              id: line.id,
              name: choices[line.id]!.name.trim(),
              amount: choices[line.id]!.amount.trim() || null,
            })),
          },
        })
      )
      await refresh()
      toast.success(
        result.offTheList > 0
          ? t("pantry.receipts.addedOff", {
              count: result.added,
              off: result.offTheList,
            })
          : t("pantry.receipts.added", { count: result.added })
      )
      await navigate({ to: "/pantry", replace: true })
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
      setBusy(null)
    }
  }

  async function discard() {
    setBusy("discard")
    try {
      await unwrap(
        api.DELETE("/api/pantry/receipts/{receiptId}", {
          params: { path: { receiptId: receipt.id } },
        })
      )
      await refresh()
      await navigate({ to: "/pantry", replace: true })
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
      setBusy(null)
    }
  }

  const said = [
    receipt.date && DAY.format(new Date(`${receipt.date}T12:00:00Z`)),
    t("pantry.receipts.lines", { count: receipt.lines.length }),
    receipt.total !== null && money(receipt.total),
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <>
      <PageHeader
        title={receipt.store ?? t("pantry.receipts.title")}
        description={said}
      />
      <div className="grid max-w-2xl gap-4">
        {receipt.files.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {receipt.files.map((file, index) => {
              const pdf = file.mediaType === "application/pdf"
              const name = t("pantry.receipts.page", { n: index + 1 })
              return (
                <button
                  key={file.url}
                  type="button"
                  className="shrink-0 rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  aria-label={t("pantry.receipts.show", { name })}
                  onClick={() => setPreviewed({ name, url: file.url, pdf })}
                >
                  {pdf ? (
                    <span className="grid size-16 place-items-center rounded-xl border bg-card text-destructive">
                      <HugeiconsIcon icon={File02Icon} strokeWidth={2} />
                    </span>
                  ) : (
                    <img
                      src={file.url}
                      alt=""
                      className="size-16 rounded-xl border object-cover object-top"
                    />
                  )}
                </button>
              )
            })}
            <p className="self-center pl-1 text-sm text-muted-foreground">
              {t("pantry.receipts.compare")}
            </p>
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {t("pantry.receipts.hint")}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0"
            onClick={() =>
              setChoices((now) =>
                Object.fromEntries(
                  Object.entries(now).map(([id, choice]) => [
                    id,
                    { ...choice, on: !allOn },
                  ])
                )
              )
            }
          >
            {allOn ? t("pantry.receipts.none") : t("pantry.receipts.all")}
          </Button>
        </div>

        <ul className="grid gap-2">
          {receipt.lines.map((line) => (
            <Line
              key={line.id}
              line={line}
              choice={choices[line.id]!}
              onChange={(next) => change(line.id, next)}
            />
          ))}
        </ul>

        <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-10 flex items-center justify-end gap-2 rounded-3xl border bg-background/95 p-2 shadow-lg backdrop-blur md:bottom-4">
          {offTheList > 0 && (
            <p className="mr-auto hidden pl-2 text-sm text-muted-foreground sm:block">
              {t("pantry.receipts.offTheList", { count: offTheList })}
            </p>
          )}
          <Button
            variant="ghost"
            disabled={busy !== null}
            onClick={() => void discard()}
          >
            {busy === "discard" && <Spinner data-icon="inline-start" />}
            {t("pantry.receipts.discard")}
          </Button>
          <Button
            disabled={busy !== null || chosen.length === 0}
            onClick={() => void add()}
          >
            {busy === "add" && <Spinner data-icon="inline-start" />}
            {t("pantry.receipts.add", { count: chosen.length })}
          </Button>
        </div>
      </div>
      <FilePreview
        file={previewed}
        onOpenChange={(open) => {
          if (!open) setPreviewed(null)
        }}
      />
    </>
  )
}

/** A line: picked or not, its name and amount, and what it said. */
function Line({
  line,
  choice,
  onChange,
}: {
  line: ReceiptLine
  choice: Choice
  onChange: (next: Partial<Choice>) => void
}) {
  const { t } = useTranslation()
  const money = useMoney()
  const id = `receipt-line-${line.id}`
  return (
    <li
      className={cn(
        "grid grid-cols-[auto_1fr] items-start gap-x-3 rounded-2xl border bg-card p-3 transition-opacity",
        !choice.on && "opacity-60"
      )}
    >
      <Checkbox
        className="mt-2.5"
        checked={choice.on}
        onCheckedChange={(on) => onChange({ on })}
        aria-label={t("pantry.receipts.pick", { name: choice.name })}
      />
      <div className="grid min-w-0 gap-1.5">
        <div className="flex gap-2">
          <Input
            id={id}
            value={choice.name}
            maxLength={200}
            aria-label={t("pantry.receipts.name")}
            className="min-w-0 flex-1"
            onChange={(event) => onChange({ name: event.target.value })}
          />
          <Input
            value={choice.amount}
            maxLength={60}
            placeholder={t("pantry.receipts.amount")}
            aria-label={t("pantry.receipts.amount")}
            className="w-24 shrink-0"
            onChange={(event) => onChange({ amount: event.target.value })}
          />
        </div>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {line.text && <span className="font-mono">{line.text}</span>}
          {line.price !== null && <span>{money(line.price)}</span>}
          {line.listItem && (
            <Badge variant="secondary">{t("pantry.receipts.onList")}</Badge>
          )}
          {line.kind !== "food" && (
            <span>{t(`pantry.receipts.kinds.${line.kind}`)}</span>
          )}
        </p>
      </div>
    </li>
  )
}
