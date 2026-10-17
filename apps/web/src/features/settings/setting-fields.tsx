import { LockIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type * as React from "react"
import { useTranslation } from "react-i18next"

import { TextField } from "@/components/form/text-field"

import {
  fieldName,
  type SettingsForm,
  type SettingState,
} from "./use-settings-form"

/** Says a setting comes from the server's environment, so can't change here. */
export function LockedNote({ state }: { state: SettingState }) {
  const { t } = useTranslation()
  if (!state.lockedBy) return null
  return (
    <span className="inline-flex items-center gap-1.5">
      <HugeiconsIcon icon={LockIcon} strokeWidth={2} className="size-3.5" />
      {t("settings.lockedBy", { env: state.lockedBy })}
    </span>
  )
}

/** A text or number setting, locked when the environment sets it. */
export function SettingInput({
  settings,
  settingKey,
  label,
  description,
  ...props
}: Omit<React.ComponentProps<typeof TextField>, "name" | "description"> & {
  settings: SettingsForm
  settingKey: string
  description?: string
}) {
  const { form, stateOf } = settings
  const state = stateOf(settingKey)
  const name = fieldName(settingKey)
  const locked = state.lockedBy !== null
  const defaultValue =
    state.default === null || state.default === undefined
      ? undefined
      : String(state.default)

  return (
    <TextField
      label={label}
      description={locked ? <LockedNote state={state} /> : description}
      placeholder={defaultValue}
      type={state.kind === "number" ? "number" : "text"}
      disabled={locked}
      error={form.formState.errors[name]?.message}
      {...props}
      {...form.register(name)}
    />
  )
}
