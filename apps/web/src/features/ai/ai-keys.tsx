import {
  Add01Icon,
  Delete02Icon,
  RefreshIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { KEYED_PROVIDERS, PROVIDER_NAMES } from "@merran/shared"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { ApiError } from "@/lib/api/client"

import { formatMoney, type AiKey, type NewAiKey } from "./queries"

type Choice = (typeof KEYED_PROVIDERS)[number] | "openai-compatible"

/** What a key's row says it is: "Claude", or an address's own name. */
function keyName(key: AiKey) {
  return key.provider === "openai-compatible"
    ? (key.name ?? key.baseUrl ?? "")
    : PROVIDER_NAMES[key.provider]
}

/**
 * Keys and addresses, each with Test and Take off, and Add a key. The
 * server admin's and a household's look the same.
 */
export function AiKeys({
  keys,
  canAddKeys,
  canAddAddresses,
  onAdd,
  onRemove,
  onTest,
  onSetCredit,
}: {
  keys: AiKey[]
  canAddKeys: boolean
  canAddAddresses: boolean
  onAdd: (key: NewAiKey) => Promise<AiKey>
  onRemove: (key: AiKey) => Promise<void>
  onTest: (key: AiKey) => Promise<AiKey>
  onSetCredit: (key: AiKey, amount: number | null) => Promise<void>
}) {
  const { t, i18n } = useTranslation()
  const [adding, setAdding] = React.useState(false)
  const [crediting, setCrediting] = React.useState<AiKey | null>(null)
  const money = (dollars: number) => formatMoney(dollars, i18n.language)
  const [busy, setBusy] = React.useState<string | null>(null)

  /** Says what a test found: it works, and whether it has credit. */
  function sayChecked(key: AiKey) {
    const name = keyName(key)
    const check = key.creditCheck
    if (!check) toast.success(t("ai.keys.works", { name }))
    else if (check.result === "ok")
      toast.success(t("ai.keys.worksWithCredit", { name }))
    else if (check.result === "out")
      toast.error(t("ai.keys.worksNoCredit", { name }))
    else
      toast.warning(
        t("ai.keys.worksUnchecked", { name, why: check.message ?? "" })
      )
  }

  async function run(id: string, work: () => Promise<void>) {
    setBusy(id)
    try {
      await work()
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="grid gap-3">
      {keys.length > 0 && (
        <ul className="divide-y rounded-2xl border">
          {keys.map((key) => (
            <li
              key={key.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3"
            >
              <div className="grid min-w-0 flex-1 gap-0.5">
                <span className="flex flex-wrap items-center gap-2 font-medium">
                  {keyName(key)}
                  {key.fromEnvironment && (
                    <Badge variant="secondary">
                      {t("ai.keys.fromEnvironment")}
                    </Badge>
                  )}
                  {key.unreadable && (
                    <Badge variant="destructive">
                      {t("ai.keys.unreadable")}
                    </Badge>
                  )}
                  {key.outOfCreditAt && (
                    <Badge variant="destructive">
                      {t("ai.keys.outOfCredit")}
                    </Badge>
                  )}
                  {key.lowOnCredit && (
                    <Badge className="bg-amber-500/15 text-amber-800 dark:text-amber-300">
                      {t("ai.keys.lowOnCredit")}
                    </Badge>
                  )}
                </span>
                <span className="truncate text-sm text-muted-foreground">
                  {[
                    key.provider === "openai-compatible" && key.baseUrl,
                    key.hint && t("ai.keys.endsIn", { hint: key.hint }),
                    key.provider === "openai-compatible" &&
                      t("ai.keys.models", { count: key.models?.length ?? 0 }),
                    key.credit &&
                      t("ai.keys.creditLeft", {
                        left: money(key.credit.left),
                        amount: money(key.credit.amount),
                      }),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
              <div className="flex gap-1">
                {key.provider !== "openai-compatible" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy !== null}
                    onClick={() => setCrediting(key)}
                  >
                    {t("ai.keys.credit")}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy !== null}
                  onClick={() =>
                    void run(key.id, async () => {
                      sayChecked(await onTest(key))
                    })
                  }
                >
                  {busy === key.id ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <HugeiconsIcon
                      icon={RefreshIcon}
                      strokeWidth={2}
                      data-icon="inline-start"
                    />
                  )}
                  {t("ai.keys.test")}
                </Button>
                {!key.fromEnvironment && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("ai.keys.remove", { name: keyName(key) })}
                    disabled={busy !== null}
                    onClick={() => void run(key.id, () => onRemove(key))}
                  >
                    <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {(canAddKeys || canAddAddresses) && (
        <div>
          <Button variant="outline" onClick={() => setAdding(true)}>
            <HugeiconsIcon
              icon={Add01Icon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            {t("ai.keys.add")}
          </Button>
        </div>
      )}
      <CreditDialog
        aiKey={crediting}
        onOpenChange={(open) => {
          if (!open) setCrediting(null)
        }}
        onSave={async (amount) => {
          if (crediting) await onSetCredit(crediting, amount)
        }}
      />
      <AddKeyDialog
        open={adding}
        onOpenChange={setAdding}
        canAddKeys={canAddKeys}
        canAddAddresses={canAddAddresses}
        onAdd={async (key) => sayChecked(await onAdd(key))}
      />
    </div>
  )
}

/**
 * Notes the credit on a key, as its provider's dashboard says it is now:
 * the providers don't tell Merran, so it counts down from here.
 */
function CreditDialog({
  aiKey,
  onOpenChange,
  onSave,
}: {
  aiKey: AiKey | null
  onOpenChange: (open: boolean) => void
  onSave: (amount: number | null) => Promise<void>
}) {
  const { t } = useTranslation()
  const [amount, setAmount] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const id = React.useId()
  React.useEffect(() => {
    setAmount(aiKey?.credit ? String(aiKey.credit.left.toFixed(2)) : "")
  }, [aiKey])

  async function save(value: number | null) {
    setSaving(true)
    try {
      await onSave(value)
      toast.success(t("ai.keys.creditSaved"))
      onOpenChange(false)
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={aiKey !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            const value = Number(amount.replace(/[^0-9.]/g, ""))
            if (amount.trim() && !Number.isNaN(value)) void save(value)
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {t("ai.keys.creditTitle", { name: aiKey ? keyName(aiKey) : "" })}
            </DialogTitle>
            <DialogDescription>{t("ai.keys.creditHint")}</DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor={`${id}-amount`}>
              {t("ai.keys.creditAmount")}
            </FieldLabel>
            <Input
              id={`${id}-amount`}
              inputMode="decimal"
              className="max-w-40"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              autoFocus
            />
          </Field>
          <DialogFooter>
            {aiKey?.credit && (
              <Button
                type="button"
                variant="ghost"
                disabled={saving}
                onClick={() => void save(null)}
              >
                {t("ai.keys.creditStop")}
              </Button>
            )}
            <Button type="submit" disabled={saving || !amount.trim()}>
              {saving && <Spinner data-icon="inline-start" />}
              {t("ai.keys.creditSave")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function AddKeyDialog({
  open,
  onOpenChange,
  canAddKeys,
  canAddAddresses,
  onAdd,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  canAddKeys: boolean
  canAddAddresses: boolean
  onAdd: (key: NewAiKey) => Promise<void>
}) {
  const { t } = useTranslation()
  const choices: Choice[] = [
    ...(canAddKeys ? KEYED_PROVIDERS : []),
    ...(canAddAddresses ? (["openai-compatible"] as const) : []),
  ]
  const [provider, setProvider] = React.useState<Choice>(
    choices[0] ?? "anthropic"
  )
  const [key, setKey] = React.useState("")
  const [name, setName] = React.useState("")
  const [baseUrl, setBaseUrl] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const id = React.useId()
  const address = provider === "openai-compatible"
  const items = choices.map((choice) => ({
    value: choice,
    label:
      choice === "openai-compatible"
        ? t("ai.keys.address")
        : PROVIDER_NAMES[choice],
  }))

  function reset() {
    setKey("")
    setName("")
    setBaseUrl("")
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      await onAdd(
        address
          ? { provider, name, baseUrl, key: key || null }
          : { provider, key }
      )
      reset()
      onOpenChange(false)
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={(event) => void save(event)} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{t("ai.keys.addTitle")}</DialogTitle>
            <DialogDescription>{t("ai.keys.addHint")}</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`${id}-provider`}>
                {t("ai.keys.provider")}
              </FieldLabel>
              <Select
                items={items}
                value={provider}
                onValueChange={(next) => {
                  if (next) setProvider(next as Choice)
                }}
              >
                <SelectTrigger id={`${id}-provider`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {items.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {address && (
              <>
                <Field>
                  <FieldLabel htmlFor={`${id}-name`}>
                    {t("ai.keys.name")}
                  </FieldLabel>
                  <Input
                    id={`${id}-name`}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder={t("ai.keys.namePlaceholder")}
                    maxLength={60}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${id}-url`}>
                    {t("ai.keys.baseUrl")}
                  </FieldLabel>
                  <Input
                    id={`${id}-url`}
                    value={baseUrl}
                    onChange={(event) => setBaseUrl(event.target.value)}
                    placeholder="http://192.168.1.20:11434/v1"
                    inputMode="url"
                    required
                  />
                  <FieldDescription>
                    {t("ai.keys.baseUrlHint")}
                  </FieldDescription>
                </Field>
              </>
            )}
            <Field>
              <FieldLabel htmlFor={`${id}-key`}>
                {address ? t("ai.keys.keyOptional") : t("ai.keys.key")}
              </FieldLabel>
              <Input
                id={`${id}-key`}
                type="password"
                autoComplete="off"
                value={key}
                onChange={(event) => setKey(event.target.value)}
                required={!address}
              />
              <FieldDescription>{t("ai.keys.keyHint")}</FieldDescription>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t("ai.keys.cancel")}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Spinner data-icon="inline-start" />}
              {t("ai.keys.testAndAdd")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
