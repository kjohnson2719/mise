import { Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Skeleton } from "@/components/ui/skeleton"
import { api, unwrap, type Schemas } from "@/lib/api/client"

import { formatMinutes } from "./format"

type RecipeSummary = Schemas["RecipeSummary"]

/**
 * One recipe to pick, found by name on the server as it's typed: for
 * putting a meal on the plan, or picking its side.
 */
export function RecipePicker({
  onPick,
  exclude = [],
  label,
}: {
  onPick: (recipe: RecipeSummary) => void
  exclude?: readonly string[]
  /** What the search box is for. */
  label: string
}) {
  const { t } = useTranslation()
  const [words, setWords] = React.useState("")
  const [find, setFind] = React.useState("")

  // Looks a moment after typing stops, not on every key.
  React.useEffect(() => {
    const timer = setTimeout(() => setFind(words.trim()), 250)
    return () => clearTimeout(timer)
  }, [words])

  const found = useQuery({
    queryKey: ["recipes", "pick-one", find],
    queryFn: () =>
      unwrap(
        api.GET("/api/recipes", {
          params: {
            query: { ...(find ? { q: find } : {}), sort: "name", limit: 50 },
          },
        })
      ),
  })
  const shown = (found.data?.recipes ?? []).filter(
    (recipe) => !exclude.includes(recipe.id)
  )

  return (
    <div className="grid min-w-0 gap-3">
      <InputGroup>
        <InputGroupAddon>
          <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
        </InputGroupAddon>
        <InputGroupInput
          autoFocus
          placeholder={label}
          aria-label={label}
          value={words}
          onChange={(event) => setWords(event.target.value)}
        />
      </InputGroup>
      {found.isPending ? (
        <Skeleton className="h-48" />
      ) : shown.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          {t("plan.pick.none")}
        </p>
      ) : (
        <ul className="grid max-h-72 divide-y overflow-x-hidden overflow-y-auto rounded-xl border">
          {shown.map((recipe) => (
            <li key={recipe.id}>
              <button
                type="button"
                className="flex w-full min-w-0 items-center gap-3 px-3 py-2 text-left hover:bg-secondary/50"
                onClick={() => onPick(recipe)}
              >
                {recipe.photo ? (
                  <img
                    src={recipe.photo.card}
                    alt=""
                    className="size-9 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <span className="size-9 shrink-0 rounded-lg bg-secondary" />
                )}
                <span className="min-w-0 flex-1 truncate">{recipe.name}</span>
                {recipe.totalMinutes != null && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatMinutes(t, recipe.totalMinutes)}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
