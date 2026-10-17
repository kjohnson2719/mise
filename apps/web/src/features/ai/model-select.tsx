import {
  costPerUse,
  parseModelRef,
  suggestedModel,
  type AiTask,
} from "@merran/shared"
import { useTranslation } from "react-i18next"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { formatMoney, type ModelOption } from "./queries"

/** "about 3¢", "under 1¢", "about $1.20": what one use of a task costs. */
export function usePerUse() {
  const { t, i18n } = useTranslation()
  return (dollars: number) =>
    dollars < 0.01
      ? t("ai.costs.underCent")
      : dollars < 1
        ? t("ai.costs.cents", { count: Math.round(dollars * 100) })
        : t("ai.costs.dollars", { amount: formatMoney(dollars, i18n.language) })
}

/** Whether a model is the one suggested for a task. */
export function isSuggested(ref: string, task: AiTask) {
  const parsed = parseModelRef(ref)
  return (
    parsed?.kind === "keyed" &&
    parsed.model === suggestedModel(parsed.provider, task)
  )
}

/**
 * Picks a model from the ones some keys can run, or none for the default.
 * For a task, each says what a use of it costs on that model, and which
 * is suggested, so one that's more than the task needs shows.
 */
export function ModelSelect({
  id,
  value,
  onChange,
  options,
  noneLabel,
  disabled,
  showSource,
  task,
}: {
  id?: string
  value: string | null
  onChange: (ref: string | null) => void
  options: ModelOption[]
  /** What none means here: "Each key's own default", say. */
  noneLabel: string
  disabled?: boolean
  /** Says which models run on the server's keys rather than one's own. */
  showSource?: boolean
  /** The task it's for, or the one a size is like, for costs and suggestions. */
  task?: AiTask
}) {
  const { t, i18n } = useTranslation()
  const perUse = usePerUse()
  const items = [
    { value: "", label: noneLabel },
    ...options.map((option) => {
      const name =
        showSource && option.source === "server"
          ? t("ai.models.onServer", { name: option.name })
          : option.name
      const label = task
        ? t("ai.models.perUse", {
            name,
            cost: option.price
              ? perUse(costPerUse(option.price, task))
              : t("ai.costs.free"),
            unit: t(`ai.units.${task}`),
          })
        : option.price
          ? t("ai.models.priced", {
              name,
              input: formatMoney(option.price[0] ?? 0, i18n.language),
              output: formatMoney(option.price[1] ?? 0, i18n.language),
            })
          : name
      return {
        value: option.ref,
        label:
          task && isSuggested(option.ref, task)
            ? t("ai.models.suggested", { label })
            : label,
      }
    }),
  ]
  // A model picked before that no key can run now still shows.
  if (value && !options.some((option) => option.ref === value)) {
    items.push({ value, label: t("ai.models.gone", { ref: value }) })
  }
  return (
    <Select
      items={items}
      value={value ?? ""}
      onValueChange={(next) => onChange(next ? String(next) : null)}
      disabled={disabled}
    >
      <SelectTrigger id={id} className="w-full sm:w-[28rem]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value || "none"} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
