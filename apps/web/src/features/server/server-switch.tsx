import { useSuspenseQuery } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { LockedNote } from "@/features/settings/setting-fields"
import { ApiError } from "@/lib/api/client"

import { serverSettingsQuery, useSaveServerSettings } from "./queries"

/** A server setting that's on or off, saved as soon as it's switched. */
export function ServerSwitch({
  settingKey,
  label,
  description,
  disabled = false,
}: {
  settingKey: string
  label: string
  description: string
  disabled?: boolean
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
      toast.success(t("settings.server.saved"))
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
        disabled={disabled || saving || state.lockedBy !== null}
      />
    </Field>
  )
}
