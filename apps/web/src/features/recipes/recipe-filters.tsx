import {
  ArrowDown01Icon,
  Cancel01Icon,
  Search01Icon,
  Sorting05Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { DIETS, type Diet } from "@merran/shared"
import { useQuery } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Toggle } from "@/components/ui/toggle"
import { useDeals } from "@/features/stores/queries"
import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"

import {
  RECIPE_SORTS,
  RECIPE_TIMES,
  searchDiets,
  searchTags,
  tagsQuery,
  type RecipeSearch,
  type RecipeSort,
  type RecipeTime,
  type Tag,
} from "./queries"

/**
 * Search, sort, and filters by new, on sale, diet, time and tags for the Recipes
 * page. Changes go into the address.
 */
export function RecipeFilters({
  search,
  onChange,
}: {
  search: RecipeSearch
  onChange: (next: RecipeSearch) => void
}) {
  const { t } = useTranslation()
  const { data: tags = [] } = useQuery(tagsQuery)
  const deals = useDeals()
  const [words, setWords] = React.useState(search.q ?? "")
  const chosen = searchTags(search)

  // Follows the address when it changes some other way, like Clear.
  React.useEffect(
    () =>
      setWords((current) =>
        current.trim() === (search.q ?? "") ? current : (search.q ?? "")
      ),
    [search.q]
  )

  // Searches a moment after typing stops, not on every key.
  React.useEffect(() => {
    if (words.trim() === (search.q ?? "")) return
    const timer = setTimeout(
      () => onChange({ ...search, q: words.trim() || undefined }),
      300
    )
    return () => clearTimeout(timer)
  }, [words, search, onChange])

  const setTags = (next: string[]) =>
    onChange({ ...search, tags: next.length > 0 ? next.join(",") : undefined })
  const toggleTag = (name: string) => setTags(toggled(chosen, name))

  return (
    <div className="space-y-3">
      {/* Search, then the filters and the sort: one row on a wide screen. */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-[1_1_18rem]">
          <InputGroup className="h-9">
            <InputGroupAddon>
              <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              value={words}
              onChange={(event) => setWords(event.target.value)}
              placeholder={t("recipes.search")}
              aria-label={t("recipes.search")}
            />
            {words && (
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  size="icon-xs"
                  aria-label={t("recipes.clearSearch")}
                  onClick={() => setWords("")}
                >
                  <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
                </InputGroupButton>
              </InputGroupAddon>
            )}
          </InputGroup>
        </div>
        {/* On a phone, one row that scrolls sideways rather than wrapping. */}
        <div
          role="group"
          aria-label={t("recipes.filters")}
          className="-my-1 flex w-full min-w-0 [scrollbar-width:none] items-center gap-2 overflow-x-auto py-1 sm:w-auto sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden [&>*]:shrink-0"
        >
          <Toggle
            variant="outline"
            pressed={Boolean(search.new)}
            onPressedChange={(pressed) =>
              onChange({ ...search, new: pressed ? true : undefined })
            }
            title={t("recipes.notMadeYet")}
            className={cn(CHIP, "px-4")}
          >
            {t("recipes.new")}
          </Toggle>
          {(deals.any || search.onSale) && (
            <Toggle
              variant="outline"
              pressed={Boolean(search.onSale)}
              onPressedChange={(pressed) =>
                onChange({ ...search, onSale: pressed ? true : undefined })
              }
              title={t("recipes.onSaleHint", {
                store: deals.data?.store ?? "",
              })}
              className={cn(CHIP, "px-4")}
            >
              {t("recipes.onSale")}
            </Toggle>
          )}
          <DietMenu
            picked={searchDiets(search)}
            onChange={(diets) =>
              onChange({
                ...search,
                diets: diets.length > 0 ? diets.join(",") : undefined,
              })
            }
          />
          <TimeMenu
            value={search.time}
            onChange={(time) => onChange({ ...search, time })}
          />
          {tags.length > 0 && (
            <TagPicker tags={tags} chosen={chosen} onChange={setTags} />
          )}
          <SortMenu
            value={search.sort ?? "newest"}
            onChange={(sort) =>
              onChange({
                ...search,
                sort: sort === "newest" ? undefined : sort,
              })
            }
          />
        </div>
      </div>
      {/* The tags picked, each one tap from gone. */}
      {chosen.length > 0 && (
        <div
          role="group"
          aria-label={t("recipes.tagFilter.picked")}
          className="flex flex-wrap items-center gap-2"
        >
          {chosen.map((name) => (
            <Button
              key={name}
              size="sm"
              variant="secondary"
              className="rounded-full"
              aria-label={t("recipes.tagFilter.remove", { name })}
              onClick={() => toggleTag(name)}
            >
              {name}
              <HugeiconsIcon
                icon={Cancel01Icon}
                strokeWidth={2}
                data-icon="inline-end"
              />
            </Button>
          ))}
          {chosen.length > 1 && (
            <Button
              size="sm"
              variant="ghost"
              className="rounded-full text-muted-foreground"
              onClick={() => setTags([])}
            >
              {t("recipes.tagFilter.clear")}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

/** A filter chip, filled in while it's on. */
const CHIP =
  "rounded-full aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"

/** A filter menu's button, filled in like a chip while something's picked. */
function MenuChip({
  label,
  on,
  ...props
}: React.ComponentProps<typeof Button> & { label: string; on: boolean }) {
  return (
    <Button
      variant="outline"
      className={cn(
        "rounded-full px-4",
        on &&
          "border-primary bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
      )}
      {...props}
    >
      {label}
      <HugeiconsIcon
        icon={ArrowDown01Icon}
        strokeWidth={2}
        data-icon="inline-end"
      />
    </Button>
  )
}

/** Recipes with every diet label picked. */
function DietMenu({
  picked,
  onChange,
}: {
  picked: Diet[]
  onChange: (diets: Diet[]) => void
}) {
  const { t } = useTranslation()
  const label =
    picked.length === 1
      ? t(`recipes.diets.names.${picked[0]!}`)
      : picked.length > 1
        ? `${t("recipes.diets.filter")} · ${picked.length}`
        : t("recipes.diets.filter")
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<MenuChip label={label} on={picked.length > 0} />}
      />
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("recipes.diets.filter")}</DropdownMenuLabel>
          {DIETS.map((diet) => (
            <DropdownMenuCheckboxItem
              key={diet}
              checked={picked.includes(diet)}
              onCheckedChange={(on) =>
                onChange(
                  DIETS.filter((d) => (d === diet ? on : picked.includes(d)))
                )
              }
            >
              {t(`recipes.diets.names.${diet}`)}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** "Under 30 min", "Under an hour". */
function useTimeLabel() {
  const { t } = useTranslation()
  return (minutes: RecipeTime) =>
    minutes === 60
      ? t("recipes.timeFilter.hour")
      : t("recipes.timeFilter.under", { minutes })
}

/** Recipes ready in so many minutes or fewer. */
function TimeMenu({
  value,
  onChange,
}: {
  value: RecipeTime | undefined
  onChange: (time: RecipeTime | undefined) => void
}) {
  const { t } = useTranslation()
  const timeLabel = useTimeLabel()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <MenuChip
            label={value ? timeLabel(value) : t("recipes.timeFilter.label")}
            on={Boolean(value)}
          />
        }
      />
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("recipes.timeFilter.label")}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={String(value ?? "")}
            onValueChange={(next) =>
              onChange(next ? (Number(next) as RecipeTime) : undefined)
            }
          >
            <DropdownMenuRadioItem value="">
              {t("recipes.timeFilter.any")}
            </DropdownMenuRadioItem>
            {RECIPE_TIMES.map((minutes) => (
              <DropdownMenuRadioItem key={minutes} value={String(minutes)}>
                {timeLabel(minutes)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The names with this one added, or taken out if it's there (any case). */
function toggled(names: string[], name: string) {
  const key = name.toLowerCase()
  return names.some((each) => each.toLowerCase() === key)
    ? names.filter((each) => each.toLowerCase() !== key)
    : [...names, name]
}

/**
 * Recipes with every tag picked. Opens a list to search, the most used
 * first: a sheet from the bottom on a phone, a popover elsewhere.
 */
function TagPicker({
  tags,
  chosen,
  onChange,
}: {
  tags: Tag[]
  chosen: string[]
  onChange: (tags: string[]) => void
}) {
  const { t } = useTranslation()
  const phone = useIsMobile()
  const [open, setOpen] = React.useState(false)
  const [find, setFind] = React.useState("")
  React.useEffect(() => {
    if (!open) setFind("")
  }, [open])

  const label =
    chosen.length === 1
      ? chosen[0]!
      : chosen.length > 1
        ? `${t("recipes.tags")} · ${chosen.length}`
        : t("recipes.tags")
  const trigger = <MenuChip label={label} on={chosen.length > 0} />

  const words = find.trim().toLowerCase()
  const shown = tags
    .filter((tag) => tag.name.toLowerCase().includes(words))
    .sort((a, b) => b.recipes - a.recipes || a.name.localeCompare(b.name))
  const isOn = (name: string) =>
    chosen.some((each) => each.toLowerCase() === name.toLowerCase())

  const body = (
    <>
      <InputGroup className="h-9 shrink-0">
        <InputGroupAddon>
          <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
        </InputGroupAddon>
        <InputGroupInput
          type="search"
          value={find}
          onChange={(event) => setFind(event.target.value)}
          placeholder={t("recipes.tagFilter.find")}
          aria-label={t("recipes.tagFilter.find")}
          // A phone's keyboard would cover the list, so it waits for a tap.
          autoFocus={!phone}
        />
      </InputGroup>
      <div
        className={cn(
          "-mx-2 min-h-0 overflow-y-auto",
          phone ? "flex-1" : "max-h-72"
        )}
      >
        {shown.length === 0 ? (
          <p className="px-2 py-6 text-center text-muted-foreground">
            {t("recipes.tagFilter.none")}
          </p>
        ) : (
          shown.map((tag) => (
            <label
              key={tag.id}
              className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted"
            >
              <Checkbox
                checked={isOn(tag.name)}
                onCheckedChange={() => onChange(toggled(chosen, tag.name))}
              />
              <span className="min-w-0 flex-1 truncate">{tag.name}</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {tag.recipes}
              </span>
            </label>
          ))
        )}
      </div>
    </>
  )

  const clear = (
    <Button
      variant="ghost"
      size="sm"
      disabled={chosen.length === 0}
      onClick={() => onChange([])}
    >
      {t("recipes.tagFilter.clear")}
    </Button>
  )

  if (phone)
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger render={trigger} />
        <DrawerContent className="max-h-[80dvh]">
          <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
            <div className="flex items-center gap-2">
              <DrawerTitle className="flex-1">{t("recipes.tags")}</DrawerTitle>
              {clear}
            </div>
            {body}
            <DrawerClose render={<Button className="w-full" />}>
              {t("recipes.tagFilter.done")}
            </DrawerClose>
          </div>
        </DrawerContent>
      </Drawer>
    )
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={trigger} />
      <PopoverContent align="start" className="w-72 gap-3">
        <div className="flex items-center gap-2">
          <PopoverTitle className="flex-1">{t("recipes.tags")}</PopoverTitle>
          {clear}
        </div>
        {body}
      </PopoverContent>
    </Popover>
  )
}

/** The order recipes come in. Not filled in: it never narrows them. */
function SortMenu({
  value,
  onChange,
}: {
  value: RecipeSort
  onChange: (sort: RecipeSort) => void
}) {
  const { t } = useTranslation()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            className="rounded-full px-3 text-muted-foreground"
            aria-label={`${t("recipes.sortBy")}: ${t(`recipes.sort.${value}`)}`}
          />
        }
      >
        <HugeiconsIcon
          icon={Sorting05Icon}
          strokeWidth={2}
          data-icon="inline-start"
        />
        {/* Just the icon on a phone, so the filters fit beside it. */}
        <span className="hidden sm:inline">{t(`recipes.sort.${value}`)}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("recipes.sortBy")}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={value}
            onValueChange={(next) => onChange(next as RecipeSort)}
          >
            {RECIPE_SORTS.map((sort) => (
              <DropdownMenuRadioItem key={sort} value={sort}>
                {t(`recipes.sort.${sort}`)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
