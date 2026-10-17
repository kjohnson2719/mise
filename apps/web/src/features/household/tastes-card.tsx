import { Add01Icon, Cancel01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  canLeaveOut,
  DIETS,
  NO_TASTES,
  WEEKNIGHT_MINUTES,
  type AvoidLevel,
  type Diet,
} from "@merran/shared"
import { useQuery, useQueryClient } from "@tanstack/react-query"
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
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { api, ApiError, unwrap, type Schemas } from "@/lib/api/client"

import { tastesQuery } from "./queries"

type Tastes = Schemas["Tastes"]
type Avoided = Tastes["avoid"][number]

/** Mildest first, as the Select lists them. */
const LEVELS: AvoidLevel[] = ["leave-out", "never", "allergy"]

/**
 * Settings → Household → Tastes: what the household eats and doesn't, which
 * Fill the week keeps to. Anyone in the household can change it, and each
 * change saves straight away.
 */
export function TastesCard() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data } = useQuery(tastesQuery)
  const [busy, setBusy] = React.useState(false)
  const tastes: Tastes = data ?? NO_TASTES

  async function save(change: Partial<Tastes>) {
    setBusy(true)
    try {
      queryClient.setQueryData(
        tastesQuery.queryKey,
        await unwrap(
          api.PUT("/api/households/current/tastes", {
            body: { ...tastes, ...change },
          })
        )
      )
      toast.success(t("settings.household.tastes.saved"))
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
        <CardTitle>{t("settings.household.tastes.title")}</CardTitle>
        <CardDescription>
          {t("settings.household.tastes.description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!data ? (
          <Skeleton className="h-40" />
        ) : (
          <FieldGroup>
            <Field>
              <FieldLabel>{t("settings.household.tastes.avoid")}</FieldLabel>
              {tastes.avoid.length > 0 && (
                <ul className="divide-y rounded-2xl border">
                  {tastes.avoid.map((item, index) => (
                    <AvoidedRow
                      key={item.food}
                      item={item}
                      disabled={busy}
                      onChange={(level) =>
                        void save({
                          avoid: tastes.avoid.map((other, i) =>
                            i === index ? { ...other, level } : other
                          ),
                        })
                      }
                      onRemove={() =>
                        void save({
                          avoid: tastes.avoid.filter((_, i) => i !== index),
                        })
                      }
                    />
                  ))}
                </ul>
              )}
              <AddAvoided
                disabled={busy}
                onAdd={(item) =>
                  // Added again, it's changed rather than listed twice.
                  save({
                    avoid: [
                      ...tastes.avoid.filter(
                        (other) =>
                          other.food.toLowerCase() !== item.food.toLowerCase()
                      ),
                      item,
                    ],
                  })
                }
              />
              <FieldDescription>
                {t("settings.household.tastes.avoidHint")}
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>{t("settings.household.tastes.diets")}</FieldLabel>
              <ToggleGroup
                multiple
                variant="outline"
                size="sm"
                value={tastes.diets}
                onValueChange={(value) => void save({ diets: value as Diet[] })}
                disabled={busy}
                className="flex-wrap justify-start"
              >
                {DIETS.map((diet) => (
                  <ToggleGroupItem key={diet} value={diet}>
                    {t(`recipes.diets.names.${diet}`)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>

            <Field>
              <FieldLabel>
                {t("settings.household.tastes.weeknight")}
              </FieldLabel>
              <ToggleGroup
                variant="outline"
                size="sm"
                value={[String(tastes.weeknightMinutes ?? "any")]}
                onValueChange={(value) => {
                  const next = value[0]
                  if (next)
                    void save({
                      weeknightMinutes: next === "any" ? null : Number(next),
                    })
                }}
                disabled={busy}
                className="flex-wrap justify-start"
              >
                <ToggleGroupItem value="any">
                  {t("settings.household.tastes.anyLength")}
                </ToggleGroupItem>
                {WEEKNIGHT_MINUTES.map((minutes) => (
                  <ToggleGroupItem key={minutes} value={String(minutes)}>
                    {minutes === 60
                      ? t("settings.household.tastes.anHour")
                      : t("settings.household.tastes.upTo", { minutes })}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>
          </FieldGroup>
        )}
      </CardContent>
    </Card>
  )
}

/** How firmly to avoid a food, to pick from. */
function useLevelItems(food: string) {
  const { t } = useTranslation()
  return LEVELS.map((level) => ({
    value: level,
    label: t(`settings.household.tastes.levels.${level}`),
    // Nuts, dairy and the like are in too much to pick out.
    disabled: level === "leave-out" && !canLeaveOut(food),
  }))
}

function LevelSelect({
  food,
  value,
  onChange,
  disabled,
  label,
}: {
  food: string
  value: AvoidLevel
  onChange: (level: AvoidLevel) => void
  disabled: boolean
  label: string
}) {
  const items = useLevelItems(food)
  return (
    <Select
      items={items}
      value={value}
      onValueChange={(next) => {
        if (next) onChange(next as AvoidLevel)
      }}
      disabled={disabled}
    >
      <SelectTrigger className="w-36" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem
            key={item.value}
            value={item.value}
            disabled={item.disabled}
          >
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** A food the household avoids: how firmly, and who for. */
function AvoidedRow({
  item,
  disabled,
  onChange,
  onRemove,
}: {
  item: Avoided
  disabled: boolean
  onChange: (level: AvoidLevel) => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
      <span className="min-w-0 flex-1 text-sm">
        <span className="inline-block font-medium first-letter:uppercase">
          {item.food}
        </span>
        {item.who && (
          <span className="text-muted-foreground">
            {" "}
            {t("settings.household.tastes.forWho", { who: item.who })}
          </span>
        )}
      </span>
      <LevelSelect
        food={item.food}
        value={item.level}
        onChange={onChange}
        disabled={disabled}
        label={t("settings.household.tastes.levelOf", { food: item.food })}
      />
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={disabled}
        aria-label={t("settings.household.tastes.stopAvoiding", {
          food: item.food,
        })}
        onClick={onRemove}
      >
        <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
      </Button>
    </li>
  )
}

/** A food to avoid: how firmly, and who for, when it isn't everyone. */
function AddAvoided({
  disabled,
  onAdd,
}: {
  disabled: boolean
  onAdd: (item: Avoided) => Promise<void>
}) {
  const { t } = useTranslation()
  const [food, setFood] = React.useState("")
  const [who, setWho] = React.useState("")
  const [level, setLevel] = React.useState<AvoidLevel>("leave-out")
  // Nuts, dairy and the like can't be left out.
  const chosen = level === "leave-out" && !canLeaveOut(food) ? "never" : level
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        if (!food.trim()) return
        void onAdd({
          food: food.trim().toLowerCase(),
          level: chosen,
          who: who.trim() || null,
        })
        setFood("")
        setWho("")
        setLevel("leave-out")
      }}
    >
      <Input
        value={food}
        onChange={(event) => setFood(event.target.value)}
        placeholder={t("settings.household.tastes.foodPlaceholder")}
        aria-label={t("settings.household.tastes.food")}
        maxLength={60}
        className="min-w-40 flex-[2]"
      />
      <Input
        value={who}
        onChange={(event) => setWho(event.target.value)}
        placeholder={t("settings.household.tastes.whoPlaceholder")}
        aria-label={t("settings.household.tastes.who")}
        maxLength={40}
        className="min-w-28 flex-1"
      />
      <LevelSelect
        food={food}
        value={chosen}
        onChange={setLevel}
        disabled={disabled}
        label={t("settings.household.tastes.level")}
      />
      <Button
        type="submit"
        variant="outline"
        disabled={disabled || !food.trim()}
      >
        <HugeiconsIcon
          icon={Add01Icon}
          strokeWidth={2}
          data-icon="inline-start"
        />
        {t("settings.household.tastes.add")}
      </Button>
    </form>
  )
}
