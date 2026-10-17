import { ArrowDown01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { AI_TASKS, PROVIDER_NAMES, TASK_SIZES } from "@merran/shared"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { Link } from "@tanstack/react-router"
import { Trans, useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { useMe } from "@/features/auth/use-me"
import { capabilitiesQuery } from "@/features/capabilities/queries"
import { api, ApiError, unwrap } from "@/lib/api/client"

import { AiKeys } from "./ai-keys"
import { ModelSelect } from "./model-select"
import {
  formatMoney,
  formatMonth,
  householdAiQuery,
  type HouseholdAi,
  type HouseholdAiSettings,
} from "./queries"

type TaskStatus =
  | { ok: true; ref: string; source: "server" | "household" }
  | { ok: false; why: "noKey" | "notCovered" | "overLimit" | "ownLimit" }

/** A task's status: which model and whose key, or why none. */
const statusOf = (data: HouseholdAi, task: (typeof AI_TASKS)[number]) =>
  (data.status.tasks[task] ?? { ok: false, why: "noKey" }) as TaskStatus

/** A model's name, from the ones on offer, or its reference. */
function modelName(data: HouseholdAi, ref: string) {
  return data.models.find((model) => model.ref === ref)?.name ?? ref
}

/** What a household's AI does now: which model, on whose key, or why none. */
function StatusLine({ data }: { data: HouseholdAi }) {
  const { t } = useTranslation()
  const large = statusOf(data, "import")
  const small = statusOf(data, "swaps")
  if (!data.status.available) {
    const why = large.ok ? "noKey" : large.why
    return (
      <p className="text-sm text-muted-foreground">
        {t(`ai.status.why.${why}`)}
      </p>
    )
  }
  const line = (task: TaskStatus, size: "large" | "small") =>
    task.ok
      ? t(`ai.status.uses.${size}`, {
          model: modelName(data, task.ref),
          whose: t(`ai.status.whose.${task.source}`),
        })
      : t(`ai.status.none.${size}`, { why: t(`ai.status.why.${task.why}`) })
  return (
    <ul className="grid gap-1 text-sm">
      <li>{line(large, "large")}</li>
      <li className="text-muted-foreground">{line(small, "small")}</li>
    </ul>
  )
}

/** Keys the household relies on that are out of credit, or running low. */
export function useKeyAlertText() {
  const { t, i18n } = useTranslation()
  return (alert: HouseholdAi["status"]["keyAlerts"][number]) => {
    const name =
      alert.provider === "openai-compatible"
        ? (alert.name ?? t("ai.keys.address"))
        : PROVIDER_NAMES[alert.provider]
    const whose = t(`ai.alerts.whose.${alert.source}`, { name })
    return alert.outOfCredit
      ? t("ai.alerts.out", { whose })
      : alert.left === null
        ? t("ai.alerts.lowUnknown", { whose })
        : t("ai.alerts.low", {
            whose,
            left: formatMoney(alert.left, i18n.language),
          })
  }
}

function KeyAlerts({ data }: { data: HouseholdAi }) {
  const text = useKeyAlertText()
  if (data.status.keyAlerts.length === 0) return null
  return (
    <ul className="grid gap-1.5">
      {data.status.keyAlerts.map((alert) => (
        <li
          key={alert.id}
          className={
            alert.outOfCredit
              ? "rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive"
              : "rounded-xl border border-amber-500/30 bg-amber-500/[0.07] px-3 py-2 text-sm"
          }
        >
          {text(alert)}
        </li>
      ))}
    </ul>
  )
}

/**
 * Settings → Household → AI: whose key pays, the household's own keys,
 * the models it picks, a limit on its own keys, and what it's spent.
 * Household admins only.
 */
export function HouseholdAiCard() {
  const { t, i18n } = useTranslation()
  const me = useMe()
  const queryClient = useQueryClient()
  const { data } = useQuery(householdAiQuery)
  const [draft, setDraft] = React.useState<HouseholdAiSettings | null>(null)
  const [limitText, setLimitText] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const id = React.useId()
  const money = (dollars: number) => formatMoney(dollars, i18n.language)
  // A household's first key can turn AI on for the server.
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: householdAiQuery.queryKey }),
      queryClient.invalidateQueries({ queryKey: capabilitiesQuery.queryKey }),
    ])

  if (!data) {
    return (
      <Card>
        <CardContent>
          <Skeleton className="h-64" />
        </CardContent>
      </Card>
    )
  }
  const picked = draft ?? data.settings
  const change = (next: Partial<HouseholdAiSettings>) =>
    setDraft({ ...picked, ...next })
  const { server, own } = data.status
  const spentMonths = data.usage.months.filter((month) => month.calls > 0)

  async function save() {
    setSaving(true)
    try {
      const text = limitText
      const limit =
        text === null
          ? picked.monthlyLimit
          : text.trim() === ""
            ? null
            : Number(text.replace(/[^0-9.]/g, ""))
      await unwrap(
        api.PUT("/api/households/current/ai", {
          body: { ...picked, monthlyLimit: limit },
        })
      )
      await refresh()
      setDraft(null)
      setLimitText(null)
      toast.success(t("ai.household.saved"))
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("ai.household.title")}</CardTitle>
        <CardDescription>{t("ai.household.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <StatusLine data={data} />
          <KeyAlerts data={data} />

          <Field>
            <FieldLabel>{t("ai.household.serverKeys")}</FieldLabel>
            <p className="text-sm text-muted-foreground">
              {!server.hasKeys
                ? t("ai.household.serverNone")
                : !server.covers
                  ? t("ai.household.serverNotCovered")
                  : server.limit === null
                    ? t("ai.household.serverSpent", {
                        spent: money(server.spent),
                      })
                    : t("ai.household.serverSpentOf", {
                        spent: money(server.spent),
                        limit: money(server.limit),
                      })}
            </p>
          </Field>

          <Field>
            <FieldLabel>{t("ai.household.ownKeys")}</FieldLabel>
            {data.status.mayAddKeys ||
            data.status.mayAddAddresses ||
            data.keys.length > 0 ? (
              <AiKeys
                keys={data.keys}
                canAddKeys={data.status.mayAddKeys}
                canAddAddresses={data.status.mayAddAddresses}
                onAdd={async (key) => {
                  const added = await unwrap(
                    api.POST("/api/households/current/ai/keys", { body: key })
                  )
                  await refresh()
                  return added
                }}
                onRemove={async (key) => {
                  await unwrap(
                    api.DELETE("/api/households/current/ai/keys/{keyId}", {
                      params: { path: { keyId: key.id } },
                    })
                  )
                  await refresh()
                }}
                onTest={async (key) => {
                  const tested = await unwrap(
                    api.POST("/api/households/current/ai/keys/{keyId}/test", {
                      params: { path: { keyId: key.id } },
                    })
                  )
                  await refresh()
                  return tested
                }}
                onSetCredit={async (key, amount) => {
                  await unwrap(
                    api.PUT("/api/households/current/ai/keys/{keyId}/credit", {
                      params: { path: { keyId: key.id } },
                      body: { amount },
                    })
                  )
                  await refresh()
                }}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("ai.household.noOwnKeys")}
              </p>
            )}
            {/* A model at home, like Ollama, is the server's to add. */}
            <FieldDescription>
              {me.serverAdmin ? (
                <Trans
                  i18nKey="ai.household.addressHintAdmin"
                  components={{
                    link: (
                      <Link
                        to="/settings/server"
                        className="underline underline-offset-3"
                      />
                    ),
                  }}
                />
              ) : (
                t("ai.household.addressHint")
              )}
            </FieldDescription>
          </Field>

          {data.models.length > 0 && (
            <>
              <Field>
                <FieldLabel htmlFor={`${id}-large`}>
                  {t("ai.models.large")}
                </FieldLabel>
                <ModelSelect
                  id={`${id}-large`}
                  value={picked.large}
                  options={data.models}
                  noneLabel={t("ai.models.default")}
                  showSource
                  task="import"
                  onChange={(large) => change({ large })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${id}-small`}>
                  {t("ai.models.small")}
                </FieldLabel>
                <ModelSelect
                  id={`${id}-small`}
                  value={picked.small}
                  options={data.models}
                  noneLabel={t("ai.models.default")}
                  showSource
                  task="swaps"
                  onChange={(small) => change({ small })}
                />
                <FieldDescription>{t("ai.models.sizesHint")}</FieldDescription>
              </Field>
              {(picked.large ||
                picked.small ||
                Object.keys(picked.tasks).length > 0) && (
                <div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      change({ large: null, small: null, tasks: {} })
                    }
                  >
                    {t("ai.models.useSuggested")}
                  </Button>
                </div>
              )}
              <Collapsible>
                <CollapsibleTrigger
                  render={
                    <Button variant="ghost" size="sm" className="group -ml-3" />
                  }
                >
                  <HugeiconsIcon
                    icon={ArrowDown01Icon}
                    strokeWidth={2}
                    className="transition-transform group-data-[panel-open]:rotate-180"
                  />
                  {t("ai.models.perTask")}
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-3 grid gap-4">
                  {AI_TASKS.map((task) => (
                    <Field key={task}>
                      <FieldLabel htmlFor={`${id}-${task}`}>
                        {t(`ai.tasks.${task}`)}
                      </FieldLabel>
                      <ModelSelect
                        id={`${id}-${task}`}
                        value={picked.tasks[task] ?? null}
                        options={data.models}
                        noneLabel={t(`ai.models.${TASK_SIZES[task]}Default`)}
                        showSource
                        task={task}
                        onChange={(ref) => {
                          const tasks = { ...picked.tasks }
                          if (ref) tasks[task] = ref
                          else delete tasks[task]
                          change({ tasks })
                        }}
                      />
                    </Field>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            </>
          )}

          {data.keys.length > 0 && (
            <Field>
              <FieldLabel htmlFor={`${id}-limit`}>
                {t("ai.household.ownLimit")}
              </FieldLabel>
              <Input
                id={`${id}-limit`}
                inputMode="decimal"
                className="max-w-40"
                placeholder={t("ai.policy.noLimit")}
                value={
                  limitText ??
                  (picked.monthlyLimit === null
                    ? ""
                    : String(picked.monthlyLimit))
                }
                onChange={(event) => setLimitText(event.target.value)}
              />
              <FieldDescription>
                {own.limit === null
                  ? t("ai.household.ownSpent", { spent: money(own.spent) })
                  : t("ai.household.ownSpentOf", {
                      spent: money(own.spent),
                      limit: money(own.limit),
                    })}
              </FieldDescription>
            </Field>
          )}

          {data.status.available && (
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor={`${id}-tidy`}>
                  {t("ai.household.autoTidy")}
                </FieldLabel>
                <FieldDescription>
                  {t("ai.household.autoTidyHint")}
                </FieldDescription>
              </FieldContent>
              <Switch
                id={`${id}-tidy`}
                checked={picked.autoTidy}
                onCheckedChange={(autoTidy) => change({ autoTidy })}
              />
            </Field>
          )}

          <Field>
            <FieldLabel>{t("ai.spend.title")}</FieldLabel>
            {spentMonths.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {t("ai.spend.nothingYet")}
              </p>
            )}
            <ul className="grid gap-1 text-sm">
              {spentMonths.map((month) => (
                <li key={month.month} className="flex justify-between gap-3">
                  <span>{formatMonth(month.month, i18n.language)}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {t("ai.spend.split", {
                      server: money(month.server),
                      own: money(month.household),
                    })}
                  </span>
                </li>
              ))}
            </ul>
            {(data.usage.tasks.length > 0 || data.usage.people.length > 0) && (
              <div className="mt-2 grid gap-4 sm:grid-cols-2">
                <ul className="grid content-start gap-1 text-sm">
                  <li className="font-medium">{t("ai.spend.byTask")}</li>
                  {data.usage.tasks.map((task) => (
                    <li key={task.task} className="flex justify-between gap-3">
                      <span>
                        {t(
                          `ai.tasks.${task.task as (typeof AI_TASKS)[number]}`
                        )}
                      </span>
                      <span className="text-muted-foreground tabular-nums">
                        {money(task.cost)}
                      </span>
                    </li>
                  ))}
                </ul>
                <ul className="grid content-start gap-1 text-sm">
                  <li className="font-medium">{t("ai.spend.byPerson")}</li>
                  {data.usage.people.map((person) => (
                    <li
                      key={person.userId ?? "background"}
                      className="flex justify-between gap-3"
                    >
                      <span>{person.name ?? t("ai.spend.background")}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {money(person.cost)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Field>
        </FieldGroup>
      </CardContent>
      {/* Something to save: models to pick, or a limit on its own keys. */}
      {(data.models.length > 0 || data.keys.length > 0) && (
        <CardFooter>
          <Button
            disabled={(draft === null && limitText === null) || saving}
            onClick={() => void save()}
          >
            {saving && <Spinner data-icon="inline-start" />}
            {t("ai.household.save")}
          </Button>
        </CardFooter>
      )}
    </Card>
  )
}

/**
 * On Today: a warning when this month's AI spend nears its limit, on the
 * server's keys or the household's own.
 */
export function AiLimitNote() {
  const { t, i18n } = useTranslation()
  const keyAlertText = useKeyAlertText()
  const { data } = useQuery({ ...householdAiQuery, staleTime: 5 * 60_000 })
  if (!data) return null
  const { server, own, keyAlerts } = data.status
  const money = (dollars: number) => formatMoney(dollars, i18n.language)
  const alert = keyAlerts.find((one) => one.outOfCredit) ?? keyAlerts[0] ?? null
  const text = alert
    ? keyAlertText(alert)
    : server.near && server.limit !== null
      ? t("ai.near.server", {
          spent: money(server.spent),
          limit: money(server.limit),
        })
      : own.near && own.limit !== null
        ? t("ai.near.own", { spent: money(own.spent), limit: money(own.limit) })
        : null
  if (!text) return null
  return (
    <p
      role="status"
      className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] px-4 py-3 text-sm"
    >
      {text}
    </p>
  )
}
