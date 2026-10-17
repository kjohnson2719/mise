import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Spinner } from "@/components/ui/spinner"
import { api, ApiError, unwrap } from "@/lib/api/client"
import { cn } from "@/lib/utils"

import { useRefreshRecipes } from "../queries"
import {
  useRefreshReview,
  type Proposal,
  type ProposalSection,
  type TidyValues,
} from "./queries"

type Mark = "needed" | "swappable" | "optional"
const MARKS: Mark[] = ["needed", "swappable", "optional"]

/**
 * A suggestion to review: each section it changes, as it is and as it'd
 * be, ticked to apply or not. Applying changes the recipe, keeping a
 * version; dismissing leaves it as it is.
 */
export function ProposalReview({
  proposal,
  onDone,
  className,
}: {
  proposal: Proposal
  /** Applied or dismissed. */
  onDone?: (what: "applied" | "dismissed") => void
  className?: string
}) {
  const { t } = useTranslation()
  const refreshReview = useRefreshReview()
  const refreshRecipes = useRefreshRecipes()
  const [picked, setPicked] = React.useState<Set<ProposalSection>>(
    () => new Set(proposal.sections)
  )
  const [busy, setBusy] = React.useState<"apply" | "dismiss" | null>(null)

  async function finish(what: "apply" | "dismiss") {
    setBusy(what)
    try {
      if (what === "apply") {
        await unwrap(
          api.POST("/api/proposals/{proposalId}/apply", {
            params: { path: { proposalId: proposal.id } },
            body: { sections: [...picked] },
          })
        )
        toast.success(
          t("recipes.tidy.applied", { name: proposal.recipe?.name ?? "" })
        )
      } else {
        await unwrap(
          api.POST("/api/proposals/{proposalId}/dismiss", {
            params: { path: { proposalId: proposal.id } },
          })
        )
      }
      await Promise.all([refreshReview(), refreshRecipes()])
      onDone?.(what === "apply" ? "applied" : "dismissed")
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
      // Stale, or already done: show what's true now.
      if (err.status === 409) await refreshReview()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={cn("grid gap-4", className)}>
      {proposal.note && (
        <blockquote className="border-l-2 pl-3 text-sm italic">
          {t("recipes.review.fromNote", { note: proposal.note })}
        </blockquote>
      )}
      <p className="text-sm text-muted-foreground">{proposal.summary}</p>
      <ul className="grid gap-3">
        {proposal.sections.map((section) => {
          const id = `${proposal.id}-${section}`
          return (
            <li
              key={section}
              className="grid gap-3 rounded-2xl border bg-card p-3 sm:p-4"
            >
              <div className="flex items-center gap-2.5">
                <Checkbox
                  id={id}
                  checked={picked.has(section)}
                  disabled={busy !== null}
                  onCheckedChange={(checked) =>
                    setPicked((now) => {
                      const next = new Set(now)
                      if (checked) next.add(section)
                      else next.delete(section)
                      return next
                    })
                  }
                />
                <label htmlFor={id} className="text-sm font-medium">
                  {t(`recipes.tidy.sections.${section}`)}
                </label>
              </div>
              <SectionChange
                section={section}
                before={proposal.before}
                after={proposal.after}
                tidied={proposal.kind === "tidy"}
              />
            </li>
          )
        })}
      </ul>
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="ghost"
          disabled={busy !== null}
          onClick={() => void finish("dismiss")}
        >
          {busy === "dismiss" && <Spinner data-icon="inline-start" />}
          {t("recipes.tidy.dismiss")}
        </Button>
        <Button
          disabled={busy !== null || picked.size === 0}
          onClick={() => void finish("apply")}
        >
          {busy === "apply" && <Spinner data-icon="inline-start" />}
          {picked.size === proposal.sections.length
            ? t("recipes.tidy.applyAll")
            : t("recipes.tidy.apply", { count: picked.size })}
        </Button>
      </div>
    </div>
  )
}

/** One section, as it is and as it'd be. */
function SectionChange({
  section,
  before,
  after,
  tidied,
}: {
  section: ProposalSection
  before: TidyValues
  after: TidyValues
  /** From tidy up, rather than a cooking note. */
  tidied: boolean
}) {
  const { t } = useTranslation()
  switch (section) {
    case "ingredients":
    case "steps":
      return (
        <BeforeAfter
          tidied={tidied}
          before={<Lines lines={before[section] ?? []} />}
          after={<Lines lines={after[section] ?? []} />}
        />
      )
    case "tags":
      return <TagChange before={before.tags ?? []} after={after.tags ?? []} />
    case "description":
      return <p className="text-sm">{after.description}</p>
    case "details":
      return <DetailsChange before={before.details} after={after.details} />
    case "notes":
      return (
        <BeforeAfter
          tidied={tidied}
          before={
            <p className="text-sm whitespace-pre-line">
              {before.notes || t("recipes.review.noNotes")}
            </p>
          }
          after={<p className="text-sm whitespace-pre-line">{after.notes}</p>}
        />
      )
    case "marks":
      return (
        <BeforeAfter
          tidied={tidied}
          before={
            (before.marks ?? []).some((line) => line.mark) ? (
              <MarkGroups lines={before.marks ?? []} />
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("recipes.tidy.notMarked")}
              </p>
            )
          }
          after={<MarkGroups lines={after.marks ?? []} />}
        />
      )
    case "foods":
      return (
        <BeforeAfter
          tidied={tidied}
          before={<NamedFoods lines={before.foods ?? []} />}
          after={<NamedFoods lines={after.foods ?? []} />}
        />
      )
  }
}

/** Lines and the food each was said to be, for the ones that have one. */
function NamedFoods({
  lines,
}: {
  lines: readonly { line: string; food: string | null }[]
}) {
  const { t } = useTranslation()
  const named = lines.filter((line) => line.food)
  if (named.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("recipes.tidy.noFood")}
      </p>
    )
  }
  return (
    <ul className="grid gap-1 text-sm">
      {named.map(({ line, food }) => (
        <li key={line}>
          {line} <span className="text-muted-foreground">→</span>{" "}
          <span className="font-medium">{food}</span>
        </li>
      ))}
    </ul>
  )
}

function BeforeAfter({
  before,
  after,
  tidied = true,
}: {
  before: React.ReactNode
  after: React.ReactNode
  tidied?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="grid content-start gap-1.5">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {t("recipes.tidy.now")}
        </p>
        <div className="text-muted-foreground">{before}</div>
      </div>
      <div className="grid content-start gap-1.5">
        <p className="text-xs font-medium tracking-wide text-primary uppercase">
          {tidied ? t("recipes.tidy.tidied") : t("recipes.review.suggested")}
        </p>
        {after}
      </div>
    </div>
  )
}

/** Editor lines, "# Section" lines as headings. */
function Lines({ lines }: { lines: readonly string[] }) {
  return (
    <ul className="grid gap-1 text-sm">
      {lines.map((line, index) =>
        line.trim().startsWith("#") ? (
          <li key={index} className="pt-1 font-medium">
            {line.replace(/^#+\s*/, "")}
          </li>
        ) : (
          <li key={index} className="min-w-0 break-words">
            {line}
          </li>
        )
      )}
    </ul>
  )
}

function TagChange({
  before,
  after,
}: {
  before: readonly string[]
  after: readonly string[]
}) {
  const key = (tag: string) => tag.trim().toLowerCase()
  const kept = new Set(before.map(key))
  const going = before.filter(
    (tag) => !after.some((other) => key(other) === key(tag))
  )
  return (
    <div className="flex flex-wrap gap-1.5">
      {after.map((tag) => (
        <Badge key={tag} variant={kept.has(key(tag)) ? "secondary" : "default"}>
          {tag}
        </Badge>
      ))}
      {going.map((tag) => (
        <Badge key={tag} variant="outline" className="line-through opacity-60">
          {tag}
        </Badge>
      ))}
    </div>
  )
}

type Details = NonNullable<TidyValues["details"]>

function DetailsChange({
  before,
  after,
}: {
  before: Details | undefined
  after: Details | undefined
}) {
  const { t } = useTranslation()
  if (!after) return null
  const filled = (
    ["servings", "prepMinutes", "cookMinutes", "totalMinutes"] as const
  ).filter((key) => after[key] !== null && before?.[key] !== after[key])
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {filled.map((key) => (
        <li key={key}>
          {t(`recipes.tidy.details.${key}`, { count: after[key] ?? 0 })}
        </li>
      ))}
    </ul>
  )
}

/** Lines grouped by what they are to the dish. */
function MarkGroups({
  lines,
}: {
  lines: readonly { line: string; mark: Mark | null }[]
}) {
  const { t } = useTranslation()
  return (
    <dl className="grid gap-2 text-sm">
      {MARKS.map((mark) => {
        const marked = lines.filter((line) => line.mark === mark)
        if (marked.length === 0) return null
        return (
          <div key={mark} className="grid gap-0.5">
            <dt className="font-medium">{t(`recipes.tidy.marks.${mark}`)}</dt>
            <dd className="text-muted-foreground">
              {marked.map((line) => line.line).join(" · ")}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}
