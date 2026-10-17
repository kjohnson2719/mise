import {
  ArrowLeft01Icon,
  CheckmarkCircle02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import * as React from "react"
import { useTranslation } from "react-i18next"

import { PageHeader } from "@/components/layout/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { householdQuery, isAdminRole } from "@/features/household/queries"
import { ProposalReview } from "@/features/recipes/tidy/proposal-review"
import {
  runGoing,
  tidyRunsQuery,
  useProposals,
  type Proposal,
} from "@/features/recipes/tidy/queries"
import {
  TidyLibraryButton,
  TidyRunCard,
} from "@/features/recipes/tidy/tidy-runs"

export const Route = createFileRoute("/_app/recipes/review")({
  component: Review,
})

/**
 * What AI suggests for the household's recipes, waiting to be applied or
 * dismissed, and the runs tidying many at once.
 */
function Review() {
  const { t } = useTranslation()
  const proposals = useProposals()
  const runs = useQuery(tidyRunsQuery)
  const { data: household } = useQuery(householdQuery)
  const items = proposals.data?.pages.flatMap((page) => page.proposals) ?? []
  const total = proposals.data?.pages[0]?.total ?? 0
  const going = runGoing(runs.data?.runs)
  const latest = going ?? runs.data?.runs[0]
  const untidied = runs.data?.untidied ?? 0

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="mt-2 -ml-3 md:mt-4"
        render={<Link to="/recipes" />}
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
        {t("nav.recipes")}
      </Button>
      <PageHeader
        title={t("recipes.tidy.reviewTitle")}
        description={t("recipes.tidy.reviewPage")}
        actions={
          isAdminRole(household?.role) &&
          !going &&
          untidied > 0 && <TidyLibraryButton untidied={untidied} />
        }
      />

      <div className="grid gap-4">
        {latest && <TidyRunCard run={latest} />}

        {proposals.isPending ? (
          <div className="grid gap-3">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-20 rounded-2xl" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <Empty className="rounded-3xl border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} />
              </EmptyMedia>
              <EmptyTitle>{t("recipes.tidy.none")}</EmptyTitle>
              <EmptyDescription>{t("recipes.tidy.noneHint")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {t("recipes.tidy.waiting", { count: total })}
            </p>
            <ul className="grid gap-3">
              {items.map((proposal, index) => (
                <ProposalItem
                  key={proposal.id}
                  proposal={proposal}
                  // The first opens by itself, to start on.
                  startOpen={index === 0}
                />
              ))}
            </ul>
            {proposals.hasNextPage && (
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  disabled={proposals.isFetchingNextPage}
                  onClick={() => void proposals.fetchNextPage()}
                >
                  {proposals.isFetchingNextPage && <Spinner />}
                  {t("recipes.showMore")}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}

/** A suggestion: its recipe and summary, opening to its review. */
function ProposalItem({
  proposal,
  startOpen,
}: {
  proposal: Proposal
  startOpen: boolean
}) {
  const { t } = useTranslation()
  const [open, setOpen] = React.useState(startOpen)
  // The next in line opens once the one above is applied or dismissed.
  React.useEffect(() => {
    if (startOpen) setOpen(true)
  }, [startOpen])
  return (
    <li className="rounded-2xl border bg-card">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-4">
          <div className="grid min-w-0 flex-1 gap-1">
            {proposal.recipe && (
              <Link
                to="/recipes/$slug"
                params={{ slug: proposal.recipe.slug }}
                className="truncate font-medium hover:underline"
              >
                {proposal.recipe.name}
              </Link>
            )}
            {proposal.kind === "note" && (
              <p className="text-sm text-muted-foreground">
                {t("recipes.review.fromNoteLabel")}
              </p>
            )}
            <div className="flex flex-wrap gap-1">
              {proposal.sections.map((section) => (
                <Badge key={section} variant="secondary">
                  {t(`recipes.tidy.sections.${section}`)}
                </Badge>
              ))}
            </div>
          </div>
          <CollapsibleTrigger
            render={<Button variant={open ? "ghost" : "outline"} size="sm" />}
          >
            {open ? t("recipes.tidy.hide") : t("recipes.tidy.review")}
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <ProposalReview proposal={proposal} className="px-4 pb-4" />
        </CollapsibleContent>
      </Collapsible>
    </li>
  )
}
