import { ArrowDown01Icon, RefreshIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
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
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { LockedNote } from "@/features/settings/setting-fields"
import { api, ApiError, unwrap } from "@/lib/api/client"

import {
  serverSettingsQuery,
  telemetryReportQuery,
  useSaveServerSettings,
} from "./queries"

/** The opt-in daily summary for the Merran project, and exactly what's in it. */
export function TelemetryCard() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data } = useSuspenseQuery(serverSettingsQuery)
  const { data: report } = useSuspenseQuery(telemetryReportQuery)
  const save = useSaveServerSettings()
  const [saving, setSaving] = React.useState(false)
  const [renewing, setRenewing] = React.useState(false)
  const switchId = React.useId()
  const labelId = React.useId()

  const state = data.settings.find((s) => s.key === "telemetry.enabled")
  if (!state) return null
  const enabled = state.value === true

  async function change(next: boolean) {
    setSaving(true)
    try {
      await save({ "telemetry.enabled": next })
      toast.success(
        next
          ? t("settings.server.telemetry.turnedOn")
          : t("settings.server.telemetry.turnedOff")
      )
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      toast.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function newInstallId() {
    setRenewing(true)
    try {
      queryClient.setQueryData(
        telemetryReportQuery.queryKey,
        await unwrap(api.POST("/api/telemetry/install-id"))
      )
      toast.success(t("settings.server.telemetry.newIdMade"))
    } finally {
      setRenewing(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.server.telemetry.title")}</CardTitle>
        <CardDescription>
          {t("settings.server.telemetry.description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel id={labelId} htmlFor={switchId}>
                {t("settings.server.telemetry.send")}
              </FieldLabel>
              <FieldDescription>
                {state.lockedBy ? (
                  <LockedNote state={state} />
                ) : (
                  t("settings.server.telemetry.never")
                )}
              </FieldDescription>
            </FieldContent>
            {saving && <Spinner />}
            <Switch
              id={switchId}
              aria-labelledby={labelId}
              checked={enabled}
              onCheckedChange={(next) => void change(next)}
              disabled={saving || state.lockedBy !== null}
            />
          </Field>
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
              {t("settings.server.telemetry.show")}
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 space-y-3">
              <pre className="overflow-x-auto rounded-2xl bg-muted p-4 text-xs leading-relaxed">
                {JSON.stringify(report, null, 2)}
              </pre>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  {t("settings.server.telemetry.installIdHint")}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={newInstallId}
                  disabled={renewing}
                >
                  {renewing ? (
                    <Spinner />
                  ) : (
                    <HugeiconsIcon icon={RefreshIcon} strokeWidth={2} />
                  )}
                  {t("settings.server.telemetry.newId")}
                </Button>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </FieldGroup>
      </CardContent>
    </Card>
  )
}
