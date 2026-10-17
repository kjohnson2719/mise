import { MEALS } from "@merran/shared"
import { useTranslation } from "react-i18next"

import { Field, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { useWhenWords } from "./use-when-words"
import { whenOptions } from "./when"

type Option = { value: string; label: string }

function SelectField({
  id,
  label,
  options,
  value,
  onChange,
}: {
  id: string
  label: string
  options: Option[]
  value: string
  onChange: (value: string) => void
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        items={options}
        value={value}
        onValueChange={(next) => {
          if (next) onChange(next)
        }}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}

/** Which day (or week's pool) a meal goes on, from `week` for two weeks. */
export function WhenField({
  week,
  value,
  onChange,
}: {
  week: string
  value: string
  onChange: (value: string) => void
}) {
  const { t } = useTranslation()
  const words = useWhenWords()
  return (
    <SelectField
      id="plan-when"
      label={t("plan.when")}
      options={whenOptions(week, words)}
      value={value}
      onChange={onChange}
    />
  )
}

/** Which meal: any of them, planned on its own or not. */
export function MealField({
  value,
  onChange,
  keepOwn = false,
}: {
  value: string
  onChange: (value: string) => void
  /** Offer "each one's own", for moving several. */
  keepOwn?: boolean
}) {
  const { t } = useTranslation()
  const options = [
    ...(keepOwn ? [{ value: "", label: t("plan.keepMeal") }] : []),
    ...MEALS.map((meal) => ({ value: meal, label: t(`plan.meals.${meal}`) })),
  ]
  return (
    <SelectField
      id="plan-meal"
      label={t("plan.meal")}
      options={options}
      value={value}
      onChange={onChange}
    />
  )
}
