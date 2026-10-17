import { useSuspenseQuery } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import { ApiError } from "@/lib/api/client"

import { serverSettingsQuery, useSaveServerSettings } from "./queries"

type Key = "video.enabled" | "video.autoUpdate"

/** Video import: whether yt-dlp and ffmpeg are there, and its switches. */
export function VideoCard() {
  const { t } = useTranslation()
  const { data } = useSuspenseQuery(serverSettingsQuery)
  const { ytDlp, ffmpeg, cookies } = data.video
  const enabled =
    data.settings.find((s) => s.key === "video.enabled")?.value === true
  const on = enabled && Boolean(ytDlp && ffmpeg)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.server.video.title")}</CardTitle>
        <CardDescription>
          {t("settings.server.video.description")}
        </CardDescription>
        <CardAction>
          <Badge variant={on ? "default" : "secondary"}>
            {on ? t("common.on") : t("common.off")}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <ul className="grid gap-1 text-sm">
            <li>
              {ytDlp
                ? t("settings.server.video.ytDlp", { version: ytDlp })
                : t("settings.server.video.ytDlpMissing")}
            </li>
            <li>
              {ffmpeg
                ? t("settings.server.video.ffmpeg", { version: ffmpeg })
                : t("settings.server.video.ffmpegMissing")}
            </li>
            <li className="text-muted-foreground">
              {cookies
                ? t("settings.server.video.cookies")
                : t("settings.server.video.noCookies")}
            </li>
          </ul>
          {(!ytDlp || !ffmpeg) && (
            <p className="text-sm text-muted-foreground">
              {t("settings.server.video.install")}
            </p>
          )}
          <SettingSwitch
            settingKey="video.enabled"
            label={t("settings.server.video.enabled")}
            description={t("settings.server.video.enabledHint")}
          />
          <SettingSwitch
            settingKey="video.autoUpdate"
            label={t("settings.server.video.autoUpdate")}
            description={t("settings.server.video.autoUpdateHint")}
          />
        </FieldGroup>
      </CardContent>
    </Card>
  )
}

function SettingSwitch({
  settingKey,
  label,
  description,
}: {
  settingKey: Key
  label: string
  description: string
}) {
  const { t } = useTranslation()
  const { data } = useSuspenseQuery(serverSettingsQuery)
  const save = useSaveServerSettings()
  const [saving, setSaving] = React.useState(false)
  const id = React.useId()
  const labelId = React.useId()
  const state = data.settings.find((s) => s.key === settingKey)
  if (!state) return null

  async function change(next: boolean) {
    setSaving(true)
    try {
      await save({ [settingKey]: next })
      toast.success(t("settings.server.video.saved"))
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      toast.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Field orientation="horizontal">
      <FieldContent>
        <FieldLabel id={labelId} htmlFor={id}>
          {label}
        </FieldLabel>
        <FieldDescription>
          {state.lockedBy ? <LockedNote state={state} /> : description}
        </FieldDescription>
      </FieldContent>
      {saving && <Spinner />}
      <Switch
        id={id}
        aria-labelledby={labelId}
        checked={state.value === true}
        onCheckedChange={(next) => void change(next)}
        disabled={saving || state.lockedBy !== null}
      />
    </Field>
  )
}
