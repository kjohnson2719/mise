import { useSuspenseQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { FieldGroup } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { SettingInput } from "@/features/settings/setting-fields"
import { useSettingsForm } from "@/features/settings/use-settings-form"

import { serverSettingsQuery, useSaveServerSettings } from "./queries"

const KEYS = [
  "errorTracking.dsn",
  "errorTracking.environment",
  "errorTracking.sampleRate",
] as const

/** Where errors go: the operator's own Sentry, GlitchTip or Bugsink. */
export function ErrorTrackingCard() {
  const { t } = useTranslation()
  const { data } = useSuspenseQuery(serverSettingsQuery)
  const save = useSaveServerSettings()
  const settings = useSettingsForm(data.settings, KEYS, async (changes) => {
    await save(changes)
    toast.success(t("settings.server.errorTracking.saved"))
  })
  const { errors, isDirty, isSubmitting } = settings.form.formState
  const on = Boolean(settings.stateOf("errorTracking.dsn").value)
  const allLocked = KEYS.every((key) => settings.stateOf(key).lockedBy)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.server.errorTracking.title")}</CardTitle>
        <CardDescription>
          {t("settings.server.errorTracking.description")}
        </CardDescription>
        <CardAction>
          <Badge variant={on ? "default" : "secondary"}>
            {on ? t("common.on") : t("common.off")}
          </Badge>
        </CardAction>
      </CardHeader>
      <form onSubmit={settings.onSubmit} noValidate>
        <CardContent>
          <FieldGroup>
            {errors.root && (
              <Alert variant="destructive">
                <AlertDescription>{errors.root.message}</AlertDescription>
              </Alert>
            )}
            <SettingInput
              settings={settings}
              settingKey="errorTracking.dsn"
              label={t("settings.server.errorTracking.dsn")}
              description={t("settings.server.errorTracking.dsnHint")}
              placeholder="https://…@sentry.example.com/1"
              autoComplete="off"
              spellCheck={false}
            />
            <div className="grid gap-6 sm:grid-cols-2">
              <SettingInput
                settings={settings}
                settingKey="errorTracking.environment"
                label={t("settings.server.errorTracking.environment")}
                description={t("settings.server.errorTracking.environmentHint")}
              />
              <SettingInput
                settings={settings}
                settingKey="errorTracking.sampleRate"
                label={t("settings.server.errorTracking.sampleRate")}
                description={t("settings.server.errorTracking.sampleRateHint")}
                inputMode="decimal"
                step={0.05}
                min={0}
                max={1}
              />
            </div>
          </FieldGroup>
        </CardContent>
        {!allLocked && (
          <CardFooter className="mt-6 justify-end">
            <Button type="submit" disabled={!isDirty || isSubmitting}>
              {isSubmitting && <Spinner />}
              {t("common.save")}
            </Button>
          </CardFooter>
        )}
      </form>
    </Card>
  )
}
