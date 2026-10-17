import { addDays, autoplanWeek, type Meal } from "@merran/shared"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import * as React from "react"
import { useTranslation } from "react-i18next"
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
import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { formatWeek, formatWeekday } from "@/features/plan/format"
import { autoplanQuery, useHouseholdClock } from "@/features/plan/queries"
import { api, ApiError, unwrap, type Schemas } from "@/lib/api/client"

import { householdQuery } from "./queries"

type Settings = Schemas["AutoplanSettings"]
type Run = Schemas["AutoplanRun"]

/** A Sunday, to name the weekdays from. */
const A_SUNDAY = "2026-01-04"

/**
 * Settings → Household → Plan each week: on its day and hour the week
 * ahead's empty meals fill themselves, the way Fill the week does, and
 * can go on the list. Household admins only; each change saves straight
 * away.
 */
export function AutoplanCard() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { data } = useQuery(autoplanQuery)
  const { data: household } = useQuery(householdQuery)
  const clock = useHouseholdClock()
  const [saving, setSaving] = React.useState(false)
  const [planning, setPlanning] = React.useState(false)
  const id = React.useId()
  const timeZone = household?.timeZone ?? "UTC"
  const ahead = autoplanWeek(clock.today, clock.weekStartsOn)
  const order = Array.from(
    { length: 7 },
    (_, i) => (i + clock.weekStartsOn) % 7
  )
  const days = order.map((day) => ({
    value: String(day),
    label: formatWeekday(addDays(A_SUNDAY, day), i18n.language),
  }))
  const hourFormat = new Intl.DateTimeFormat(i18n.language, {
    hour: "numeric",
    timeZone: "UTC",
  })
  const hours = Array.from({ length: 24 }, (_, hour) => ({
    value: String(hour),
    label: hourFormat.format(Date.UTC(2026, 0, 4, hour)),
  }))

  async function save(change: Partial<Settings>) {
    if (!data) return
    const { enabled, day, hour, meals, addToList } = data
    setSaving(true)
    try {
      queryClient.setQueryData(
        autoplanQuery.queryKey,
        await unwrap(
          api.PUT("/api/plan/autoplan", {
            body: { enabled, day, hour, meals, addToList, ...change },
          })
        )
      )
      toast.success(t("settings.household.autoplan.saved"))
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function planNow() {
    setPlanning(true)
    try {
      const run = await unwrap(api.POST("/api/plan/autoplan/run"))
      await Promise.all(
        ["plan", "list", "pantry"].map((area) =>
          queryClient.invalidateQueries({ queryKey: [area] })
        )
      )
      toast.success(ranText(run), {
        action: {
          label: t("settings.household.autoplan.seePlan"),
          onClick: () =>
            void navigate({ to: "/plan", search: { week: run.week } }),
        },
      })
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    } finally {
      setPlanning(false)
    }
  }

  /** "Planned 6 meals for Oct 19 – 25. 18 things on the list." */
  function ranText(run: Run) {
    const week = formatWeek(run.week, i18n.language)
    const planned =
      run.empty === 0
        ? t("settings.household.autoplan.allPlanned", { week })
        : run.planned === 0
          ? t("settings.household.autoplan.noIdeas", { week })
          : t("settings.household.autoplan.planned", {
              count: run.planned,
              week,
            })
    return run.listed > 0
      ? `${planned} ${t("settings.household.autoplan.listed", { count: run.listed })}`
      : planned
  }

  const next = data?.next
    ? new Intl.DateTimeFormat(i18n.language, {
        weekday: "long",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone,
      }).format(new Date(data.next))
    : null
  const meals = (data?.meals ?? []).filter((meal) => clock.meals.includes(meal))

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.household.autoplan.title")}</CardTitle>
        <CardDescription>
          {t("settings.household.autoplan.description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!data ? (
          <Skeleton className="h-56" />
        ) : (
          <FieldGroup>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel id={`${id}-on-label`} htmlFor={`${id}-on`}>
                  {t("settings.household.autoplan.on")}
                </FieldLabel>
                <FieldDescription>
                  {next
                    ? t("settings.household.autoplan.next", { when: next })
                    : t("settings.household.autoplan.off")}
                </FieldDescription>
              </FieldContent>
              {saving && <Spinner />}
              <Switch
                id={`${id}-on`}
                aria-labelledby={`${id}-on-label`}
                checked={data.enabled}
                onCheckedChange={(enabled) => void save({ enabled })}
                disabled={saving}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor={`${id}-day`}>
                {t("settings.household.autoplan.when")}
              </FieldLabel>
              <div className="flex flex-wrap gap-2">
                <Select
                  items={days}
                  value={String(data.day)}
                  onValueChange={(day) => {
                    if (day) void save({ day: Number(day) })
                  }}
                  disabled={saving}
                >
                  <SelectTrigger
                    id={`${id}-day`}
                    className="w-40"
                    aria-label={t("settings.household.autoplan.day")}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {days.map((day) => (
                      <SelectItem key={day.value} value={day.value}>
                        {day.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  items={hours}
                  value={String(data.hour)}
                  onValueChange={(hour) => {
                    if (hour) void save({ hour: Number(hour) })
                  }}
                  disabled={saving}
                >
                  <SelectTrigger
                    className="w-32"
                    aria-label={t("settings.household.autoplan.hour")}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {hours.map((hour) => (
                      <SelectItem key={hour.value} value={hour.value}>
                        {hour.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <FieldDescription>
                {t("settings.household.autoplan.whenHint")}
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>{t("settings.household.autoplan.meals")}</FieldLabel>
              <ToggleGroup
                multiple
                variant="outline"
                size="sm"
                value={meals}
                onValueChange={(value) => {
                  if (value.length) void save({ meals: value as Meal[] })
                }}
                disabled={saving}
                className="flex-wrap justify-start"
              >
                {clock.meals.map((meal) => (
                  <ToggleGroupItem key={meal} value={meal}>
                    {t(`plan.meals.${meal}`)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>

            <Field orientation="horizontal">
              <Checkbox
                id={`${id}-list`}
                checked={data.addToList}
                onCheckedChange={(addToList) => void save({ addToList })}
                disabled={saving}
              />
              <FieldLabel htmlFor={`${id}-list`}>
                {t("settings.household.autoplan.addToList")}
              </FieldLabel>
            </Field>

            {data.last && (
              <p className="text-sm text-muted-foreground">
                {t("settings.household.autoplan.last", {
                  what: ranText(data.last),
                })}
              </p>
            )}
          </FieldGroup>
        )}
      </CardContent>
      <CardFooter>
        <Button
          variant="outline"
          disabled={!data || planning}
          onClick={() => void planNow()}
        >
          {planning && <Spinner data-icon="inline-start" />}
          {t("settings.household.autoplan.planNow", {
            week: formatWeek(ahead, i18n.language),
          })}
        </Button>
      </CardFooter>
    </Card>
  )
}
