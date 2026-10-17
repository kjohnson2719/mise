import { useForm } from "react-hook-form"

import type { Schemas } from "@/lib/api/client"
import { showFormError } from "@/lib/form-errors"

export type SettingState = Schemas["SettingState"]

type FieldValue = string | boolean
type Values = Record<string, FieldValue>

/** Form fields can't have dots in their names, which settings' keys do. */
export function fieldName(key: string) {
  return key.replaceAll(".", "/")
}

/** A setting's value as its input shows it. */
function toField(state: SettingState): FieldValue {
  if (state.kind === "switch") return state.value === true
  if (state.value === null || state.value === undefined) return ""
  if (Array.isArray(state.value)) return state.value.join(", ")
  return String(state.value)
}

/** An input's value as the API takes it. Empty means back to the default. */
function fromField(state: SettingState, value: FieldValue): unknown {
  if (state.kind === "switch") return value
  const text = String(value).trim()
  if (text === "") return null
  if (state.kind === "number") return Number(text)
  if (state.kind === "list") {
    return text
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
  }
  return text
}

/**
 * A form over some of a level's settings. Saving sends only what changed,
 * and shows the API's problems under each setting.
 */
export function useSettingsForm(
  states: SettingState[],
  keys: readonly string[],
  save: (changes: Record<string, unknown>) => Promise<unknown>
) {
  const picked = keys.flatMap((key) => {
    const state = states.find((candidate) => candidate.key === key)
    return state ? [state] : []
  })
  const form = useForm<Values>({
    values: Object.fromEntries(
      picked.map((state) => [fieldName(state.key), toField(state)])
    ),
  })

  const onSubmit = form.handleSubmit(async (values) => {
    const changes: Record<string, unknown> = {}
    for (const state of picked) {
      const name = fieldName(state.key)
      if (form.formState.dirtyFields[name]) {
        changes[state.key] = fromField(state, values[name] ?? "")
      }
    }
    if (Object.keys(changes).length === 0) return
    try {
      await save(changes)
    } catch (error) {
      const rename = Object.fromEntries(
        picked.map((state) => [state.key, fieldName(state.key)])
      )
      if (!showFormError(form.setError, error, rename)) throw error
    }
  })

  const stateOf = (key: string) => {
    const state = picked.find((candidate) => candidate.key === key)
    if (!state) throw new Error(`${key} isn't in this form`)
    return state
  }

  return { form, onSubmit, stateOf }
}

export type SettingsForm = ReturnType<typeof useSettingsForm>
