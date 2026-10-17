import { AiMagicIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useCapability } from "@/features/capabilities/queries"

import { ProposalReview } from "./proposal-review"
import { recipeProposalsQuery, type Proposal } from "./queries"

/**
 * On a recipe: what AI suggests for it, waiting, from tidy up or a cooking
 * note, each opening to its review.
 */
export function RecipeSuggestions({ recipeId }: { recipeId: string }) {
  const { t } = useTranslation()
  const aiOn = useCapability("ai")
  const { data } = useQuery({
    ...recipeProposalsQuery(recipeId),
    enabled: aiOn,
  })
  const [open, setOpen] = React.useState<Proposal | null>(null)
  const proposals = data?.proposals ?? []
  if (proposals.length === 0 && !open) return null

  return (
    <>
      <ul className="grid gap-2">
        {proposals.map((proposal) => (
          <li
            key={proposal.id}
            className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-sm"
          >
            <HugeiconsIcon
              icon={AiMagicIcon}
              strokeWidth={2}
              className="size-4 shrink-0 text-primary"
            />
            <span className="min-w-0 flex-1">
              {proposal.kind === "note"
                ? t("recipes.review.fromNoteHere", {
                    summary: proposal.summary,
                  })
                : t("recipes.tidy.waitingHere", { summary: proposal.summary })}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOpen(proposal)}
            >
              {t("recipes.tidy.review")}
            </Button>
          </li>
        ))}
      </ul>
      <Dialog
        open={open !== null}
        onOpenChange={(next) => {
          if (!next) setOpen(null)
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {open?.kind === "note"
                ? t("recipes.review.noteTitle")
                : t("recipes.tidy.title", { name: open?.recipe?.name ?? "" })}
            </DialogTitle>
            <DialogDescription>
              {open?.kind === "note"
                ? t("recipes.review.noteDescription")
                : t("recipes.tidy.reviewDescription")}
            </DialogDescription>
          </DialogHeader>
          {open && (
            <ProposalReview
              key={open.id}
              proposal={open}
              onDone={() => setOpen(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
