import {
  addDays,
  NO_THEMES,
  THEME_PRESETS,
  type NightTheme,
} from "@merran/shared"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { formatWeekday } from "@/features/plan/format"
import { api, ApiError, unwrap } from "@/lib/api/client"

import { householdQuery, themesQuery } from "./queries"

/** A Sunday, to name the weekdays from. */
const A_SUNDAY = "2026-01-04"

/** A Select value for a theme: none, one of the presets, or a tag of your own. */
function valueOf(theme: NightTheme | null) {
  if (!theme) return "none"
  const preset = THEME_PRESETS.findIndex(
    (option) =>
      option.kind === theme.kind &&
      option.name === theme.name &&
      option.tag === theme.tag
  )
  return preset === -1 ? "custom" : `preset:${preset}`
}

/**
 * Settings → Household → Theme nights: a theme for each night's dinner,
 * which Fill the week keeps to. Household admins only; each change saves
 * straight away.
 */
export function ThemeNightsCard() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const { data } = useQuery(themesQuery)
  const { data: household } = useQuery(householdQuery)
  const [busy, setBusy] = React.useState(false)
  const themes = data?.themes ?? NO_THEMES
  const weekStartsOn = household?.weekStartsOn ?? 1
  const order = Array.from({ length: 7 }, (_, i) => (i + weekStartsOn) % 7)

  async function save(weekday: number, theme: NightTheme | null) {
    const next = [...themes]
    next[weekday] = theme
    setBusy(true)
    try {
      queryClient.setQueryData(
        themesQuery.queryKey,
        await unwrap(
          api.PUT("/api/households/current/themes", {
            body: { themes: next },
          })
        )
      )
      toast.success(t("settings.household.themes.saved"))
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.household.themes.title")}</CardTitle>
        <CardDescription>
          {t("settings.household.themes.description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!data ? (
          <Skeleton className="h-64" />
        ) : (
          <div className="divide-y rounded-2xl border">
            {order.map((weekday) => (
              <NightRow
                key={weekday}
                day={formatWeekday(addDays(A_SUNDAY, weekday), i18n.language)}
                theme={themes[weekday] ?? null}
                disabled={busy}
                onChange={(theme) => void save(weekday, theme)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** A night's theme: none, a preset, or a tag of your own. */
function NightRow({
  day,
  theme,
  disabled,
  onChange,
}: {
  day: string
  theme: NightTheme | null
  disabled: boolean
  onChange: (theme: NightTheme | null) => void
}) {
  const { t } = useTranslation()
  const value = valueOf(theme)
  const [custom, setCustom] = React.useState(value === "custom")
  const [tag, setTag] = React.useState(
    theme?.kind === "tag" && value === "custom" ? (theme.tag ?? "") : ""
  )
  const id = React.useId()
  const options = [
    { value: "none", label: t("settings.household.themes.none") },
    ...THEME_PRESETS.map((preset, index) => ({
      value: `preset:${index}`,
      label: preset.name,
    })),
    { value: "custom", label: t("settings.household.themes.custom") },
  ]

  function pick(next: string) {
    if (next === "custom") {
      setCustom(true)
      return
    }
    setCustom(false)
    onChange(
      next === "none"
        ? null
        : THEME_PRESETS[Number(next.replace("preset:", ""))]!
    )
  }

  function saveTag() {
    const word = tag.trim()
    if (!word || (theme?.kind === "tag" && theme.tag === word.toLowerCase()))
      return
    onChange({
      kind: "tag",
      name: `${word[0]!.toUpperCase()}${word.slice(1)}`,
      tag: word.toLowerCase(),
    })
  }

  return (
    <div className="grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:grid-cols-[8rem_minmax(0,20rem)]">
      <label htmlFor={id} className="text-sm font-medium">
        {day}
      </label>
      <Select
        items={options}
        value={custom ? "custom" : value}
        onValueChange={(next) => {
          if (next) pick(next)
        }}
        disabled={disabled}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">{options[0]!.label}</SelectItem>
          <SelectSeparator />
          {THEME_PRESETS.map((preset, index) => (
            <SelectItem key={preset.name} value={`preset:${index}`}>
              {preset.name}
            </SelectItem>
          ))}
          <SelectSeparator />
          <SelectItem value="custom">{options.at(-1)!.label}</SelectItem>
        </SelectContent>
      </Select>
      {custom && (
        <form
          className="col-start-2"
          onSubmit={(event) => {
            event.preventDefault()
            saveTag()
          }}
        >
          <Input
            value={tag}
            onChange={(event) => setTag(event.target.value)}
            onBlur={saveTag}
            placeholder={t("settings.household.themes.tagPlaceholder")}
            aria-label={t("settings.household.themes.tag", { day })}
            autoFocus={!tag}
            maxLength={40}
          />
        </form>
      )}
    </div>
  )
}
