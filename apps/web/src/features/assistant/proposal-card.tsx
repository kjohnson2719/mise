import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { useRefreshRecipes } from "@/features/recipes/queries"
import {
  useSwapsThisTime,
  type SwapThisTime,
} from "@/features/recipes/swaps/this-time"
import { ProposalReview } from "@/features/recipes/tidy/proposal-review"
import type { Proposal } from "@/features/recipes/tidy/queries"
import { api, ApiError, unwrap } from "@/lib/api/client"

import { proposalQuery } from "./queries"

type Ref = { id: string; slug: string; name: string }
type Meal = {
  date: string
  meal: string
  recipe: Ref | null
  with: Ref | null
  note: string | null
  servings: number | null
}
type Avoided = { food: string; level: string; who: string | null }
type SwapPayload = Omit<SwapThisTime, "atHome">

const DAY = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
})
const dayName = (date: string) => DAY.format(new Date(`${date}T12:00:00Z`))

/**
 * A suggestion the assistant made, in the chat: what it would add, and
 * Apply or Dismiss. Nothing changes until it's applied.
 */
export function ProposalCard({ proposal: first }: { proposal: Proposal }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const refreshRecipes = useRefreshRecipes()
  const { data: proposal = first } = useQuery({
    ...proposalQuery(first.id),
    initialData: first,
  })
  const [busy, setBusy] = React.useState<"apply" | "dismiss" | null>(null)
  const [reviewing, setReviewing] = React.useState(false)
  const [made, setMade] = React.useState<Ref | null>(null)
  const payload = (proposal.payload ?? {}) as Record<string, unknown>
  const thisTime = useSwapsThisTime(proposal.recipe?.id ?? "")
  const swap = proposal.kind === "swap" ? (payload as SwapPayload) : null
  const using =
    swap !== null &&
    thisTime.swaps.some(
      (s) =>
        s.ingredientId === swap.ingredientId &&
        s.lines.join("\n") === swap.lines.join("\n")
    )

  /** A swap, for this time only: the recipe and cooking it show it. */
  function swapThisTime() {
    if (!swap) return
    thisTime.use({ ...swap, atHome: false })
    toast.success(t("recipes.swaps.using", { lines: swap.lines.join(", ") }), {
      action: {
        label: t("recipes.swaps.undo"),
        onClick: () => thisTime.undo(swap.ingredientId),
      },
    })
  }

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["review"] }),
      queryClient.invalidateQueries({ queryKey: ["plan"] }),
      queryClient.invalidateQueries({ queryKey: ["list"] }),
      queryClient.invalidateQueries({ queryKey: ["household", "tastes"] }),
      refreshRecipes(),
    ])
  }

  async function finish(what: "apply" | "dismiss") {
    // Changes to a recipe are looked over, a section at a time.
    if (what === "apply" && proposal.kind === "edit") {
      setReviewing(true)
      return
    }
    setBusy(what)
    try {
      if (what === "apply") {
        const result = await unwrap(
          api.POST("/api/proposals/{proposalId}/apply", {
            params: { path: { proposalId: proposal.id } },
            body: {},
          })
        )
        if (result.recipe) setMade(result.recipe)
        // Saved, it's in the recipe: no need for it this time too.
        if (swap) thisTime.undo(swap.ingredientId)
        toast.success(t(`assistant.cards.applied.${proposal.kind}`))
      } else {
        await unwrap(
          api.POST("/api/proposals/{proposalId}/dismiss", {
            params: { path: { proposalId: proposal.id } },
          })
        )
      }
      await refresh()
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
      if (err.status === 409) await refresh()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="grid gap-2.5 rounded-2xl border bg-card p-3 text-sm">
      {proposal.kind !== "swap" && (
        <p className="font-medium">{proposal.summary}</p>
      )}
      <CardBody proposal={proposal} payload={payload} />
      <div className="flex flex-wrap items-center justify-end gap-2">
        {proposal.status === "pending" ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy !== null}
              onClick={() => void finish("dismiss")}
            >
              {busy === "dismiss" && <Spinner data-icon="inline-start" />}
              {t("assistant.cards.dismiss")}
            </Button>
            <Button
              variant={swap ? "outline" : "default"}
              size="sm"
              disabled={busy !== null}
              onClick={() => void finish("apply")}
            >
              {busy === "apply" && <Spinner data-icon="inline-start" />}
              {t(`assistant.cards.apply.${proposal.kind}`)}
            </Button>
            {swap &&
              (using ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => thisTime.undo(swap.ingredientId)}
                >
                  {t("recipes.swaps.unswap", { line: swap.insteadOf })}
                </Button>
              ) : (
                <Button
                  size="sm"
                  disabled={busy !== null}
                  onClick={swapThisTime}
                >
                  {t("recipes.swaps.use")}
                </Button>
              ))}
          </>
        ) : (
          <span className="flex items-center gap-2 text-muted-foreground">
            {proposal.status === "applied"
              ? t(`assistant.cards.done.${proposal.kind}`)
              : t("assistant.cards.dismissed")}
            {proposal.status === "applied" && (
              <AppliedLink proposal={proposal} made={made} />
            )}
          </span>
        )}
      </div>
      <Dialog open={reviewing} onOpenChange={setReviewing}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{proposal.recipe?.name}</DialogTitle>
            <DialogDescription>
              {t("recipes.tidy.reviewDescription")}
            </DialogDescription>
          </DialogHeader>
          <ProposalReview
            proposal={proposal}
            onDone={() => {
              setReviewing(false)
              void refresh()
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Where to see what was added. */
function AppliedLink({
  proposal,
  made,
}: {
  proposal: Proposal
  made: Ref | null
}) {
  const { t } = useTranslation()
  const recipe = made ?? proposal.recipe
  if (recipe && proposal.kind !== "meals") {
    return (
      <Link
        to="/recipes/$slug"
        params={{ slug: recipe.slug }}
        className="font-medium text-foreground underline underline-offset-4"
      >
        {t("assistant.cards.open")}
      </Link>
    )
  }
  if (proposal.kind === "meals" || proposal.kind === "list") {
    return (
      <Link
        to={proposal.kind === "meals" ? "/plan" : "/list"}
        className="font-medium text-foreground underline underline-offset-4"
      >
        {t("assistant.cards.see")}
      </Link>
    )
  }
  return null
}

/** What a suggestion adds, by kind. */
function CardBody({
  proposal,
  payload,
}: {
  proposal: Proposal
  payload: Record<string, unknown>
}) {
  const { t } = useTranslation()
  switch (proposal.kind) {
    case "meals":
      return (
        <ul className="grid gap-1 text-muted-foreground">
          {(payload.meals as Meal[]).map((meal, i) => (
            <li key={i}>
              {t("assistant.cards.meal", {
                day: dayName(meal.date),
                meal: t(`plan.meals.${meal.meal}` as "plan.meals.dinner"),
                what: [meal.recipe?.name ?? meal.note, meal.with?.name]
                  .filter(Boolean)
                  .join(" + "),
              })}
            </li>
          ))}
        </ul>
      )
    case "list":
      return (
        <ul className="grid gap-0.5 text-muted-foreground">
          {(payload.items as string[]).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )
    case "tastes": {
      const avoid = (payload.avoid as Avoided[]) ?? []
      const diets = (payload.diets as string[]) ?? []
      const minutes = payload.weeknightMinutes as number | null
      return (
        <ul className="grid gap-0.5 text-muted-foreground">
          {avoid.map((item) => (
            <li key={`${item.food}:${item.who}`}>
              {t(
                `assistant.cards.avoid.${item.level}` as "assistant.cards.avoid.never",
                {
                  food: item.food,
                  who: item.who ?? t("assistant.cards.everyone"),
                }
              )}
            </li>
          ))}
          {diets.length > 0 && (
            <li>{t("assistant.cards.diets", { diets: diets.join(", ") })}</li>
          )}
          {minutes && <li>{t("assistant.cards.weeknight", { minutes })}</li>}
        </ul>
      )
    }
    case "recipe": {
      const recipe = payload.recipe as {
        name: string
        ingredients: string[]
        steps: string[]
      }
      return (
        <div className="grid gap-1 text-muted-foreground">
          <p className="font-medium text-foreground">{recipe.name}</p>
          <p>
            {t("assistant.cards.recipeSize", {
              ingredients: recipe.ingredients.filter((l) => !l.startsWith("#"))
                .length,
              steps: recipe.steps.filter((l) => !l.startsWith("#")).length,
            })}
          </p>
        </div>
      )
    }
    case "import": {
      const found = payload as {
        name: string
        site: string
        photo: string | null
        minutes: number | null
        why: string
      }
      return (
        <div className="flex gap-3">
          {found.photo && (
            <img
              src={found.photo}
              alt=""
              referrerPolicy="no-referrer"
              className="size-16 shrink-0 rounded-lg object-cover"
            />
          )}
          <div className="grid min-w-0 content-start gap-0.5">
            <p className="font-medium">{found.name}</p>
            <p className="text-muted-foreground">
              {[
                found.site,
                found.minutes &&
                  t("assistant.cards.minutes", { minutes: found.minutes }),
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <p className="text-muted-foreground">{found.why}</p>
          </div>
        </div>
      )
    }
    case "swap": {
      const swap = payload as SwapPayload
      return (
        <div className="grid gap-2">
          <p className="text-muted-foreground">
            {[
              proposal.recipe?.name,
              t("recipes.swaps.insteadOf", { line: swap.insteadOf }),
            ]
              .filter(Boolean)
              .join(", ")}
          </p>
          <ul className="grid gap-0.5 font-medium">
            {swap.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {swap.note && <p className="text-muted-foreground">{swap.note}</p>}
          {swap.steps.length > 0 && (
            <div className="grid gap-1 rounded-xl bg-muted px-3 py-2">
              <p className="font-medium">
                {t("recipes.swaps.changesSteps", { count: swap.steps.length })}
              </p>
              {swap.steps.map((step) => (
                <p key={step.stepId}>{step.text}</p>
              ))}
            </div>
          )}
        </div>
      )
    }
    case "edit":
      return (
        <div className="grid gap-1.5">
          {proposal.recipe && (
            <p className="text-muted-foreground">{proposal.recipe.name}</p>
          )}
          <div className="flex flex-wrap gap-1">
            {proposal.sections.map((section) => (
              <Badge key={section} variant="secondary">
                {t(`recipes.tidy.sections.${section}`)}
              </Badge>
            ))}
          </div>
        </div>
      )
    default:
      return null
  }
}
