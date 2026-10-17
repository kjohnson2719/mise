import { Cancel01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"

import { tagsQuery } from "./queries"

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

/** A recipe's tags: typed, or picked from the household's. */
export function TagsField({
  value,
  onChange,
  error,
}: {
  value: string[]
  onChange: (tags: string[]) => void
  error?: string
}) {
  const { t } = useTranslation()
  const id = React.useId()
  const { data: known = [] } = useQuery(tagsQuery)
  const [draft, setDraft] = React.useState("")

  const add = (name: string) => {
    const tag = name.trim().replace(/,+$/, "").trim()
    if (tag && !value.some((existing) => same(existing, tag))) {
      onChange([...value, tag])
    }
    setDraft("")
  }
  const remove = (name: string) =>
    onChange(value.filter((existing) => !same(existing, name)))

  const suggestions = known
    .filter((tag) => !value.some((existing) => same(existing, tag.name)))
    .filter((tag) =>
      tag.name.toLowerCase().includes(draft.trim().toLowerCase())
    )
    .slice(0, 12)

  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{t("recipes.fields.tags")}</FieldLabel>
      {value.length > 0 && (
        <ul
          className="flex flex-wrap gap-1.5"
          aria-label={t("recipes.fields.tags")}
        >
          {value.map((tag) => (
            <li key={tag}>
              <Badge variant="secondary" className="h-7 gap-1 pr-1 text-sm">
                {tag}
                <button
                  type="button"
                  onClick={() => remove(tag)}
                  aria-label={t("recipes.editor.removeTag", { name: tag })}
                  className="rounded-full p-0.5 hover:bg-foreground/10"
                >
                  <HugeiconsIcon
                    icon={Cancel01Icon}
                    strokeWidth={2}
                    className="size-3"
                  />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      )}
      <Input
        id={id}
        value={draft}
        onChange={(event) => {
          const next = event.target.value
          if (next.endsWith(",")) add(next)
          else setDraft(next)
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            add(draft)
          } else if (
            event.key === "Backspace" &&
            draft === "" &&
            value.length
          ) {
            onChange(value.slice(0, -1))
          }
        }}
        onBlur={() => draft.trim() && add(draft)}
        placeholder={t("recipes.editor.tagPlaceholder")}
        aria-invalid={error ? true : undefined}
      />
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((tag) => (
            <Button
              key={tag.id}
              type="button"
              variant="outline"
              size="xs"
              onClick={() => add(tag.name)}
            >
              {tag.name}
            </Button>
          ))}
        </div>
      )}
      {error ? (
        <FieldError>{error}</FieldError>
      ) : (
        <FieldDescription>{t("recipes.editor.tagsHint")}</FieldDescription>
      )}
    </Field>
  )
}
