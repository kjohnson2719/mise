import { useQuery, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { NeedsAi, useAiFor } from "@/features/ai/needs-ai"
import { api, ApiError, unwrap } from "@/lib/api/client"

import { ProposalReview } from "./proposal-review"
import {
  recipeTidyQuery,
  useRefreshReview,
  type Proposal,
  type TidySection,
} from "./queries"

const SECTIONS: TidySection[] = [
  "ingredients",
  "steps",
  "tags",
  "description",
  "details",
  "marks",
  "foods",
]

/**
 * Tidy up for one recipe: pick what to tidy, wait while AI does, then
 * review what it suggests. A suggestion already waiting opens straight to
 * its review.
 */
export function TidyDialog({
  recipe,
  open,
  onOpenChange,
}: {
  recipe: { id: string; name: string }
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const refreshReview = useRefreshReview()
  const ai = useAiFor("tidy")
  const waiting = useQuery({ ...recipeTidyQuery(recipe.id), enabled: open })
  const [again, setAgain] = React.useState(false)
  const [picked, setPicked] = React.useState<Set<TidySection>>(
    () => new Set(SECTIONS)
  )
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  // Tidied, with nothing to change.
  const [fine, setFine] = React.useState(false)

  React.useEffect(() => {
    if (!open) {
      setAgain(false)
      setFine(false)
      setError(null)
    }
  }, [open])

  const proposal: Proposal | null =
    again || fine ? null : (waiting.data?.proposal ?? null)

  async function tidy() {
    setBusy(true)
    setError(null)
    try {
      const result = await unwrap(
        api.POST("/api/recipes/{recipe}/tidy", {
          params: { path: { recipe: recipe.id } },
          body: { sections: [...picked] },
        })
      )
      queryClient.setQueryData(recipeTidyQuery(recipe.id).queryKey, result)
      await refreshReview()
      setAgain(false)
      setFine(result.proposal === null)
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t("recipes.tidy.title", { name: recipe.name })}
          </DialogTitle>
          <DialogDescription>
            {proposal
              ? t("recipes.tidy.reviewDescription")
              : t("recipes.tidy.description")}
          </DialogDescription>
        </DialogHeader>

        {waiting.isPending ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : proposal ? (
          <>
            <ProposalReview
              key={proposal.id}
              proposal={proposal}
              onDone={() => onOpenChange(false)}
            />
            <Button
              variant="link"
              className="justify-self-start px-0"
              onClick={() => setAgain(true)}
            >
              {t("recipes.tidy.again")}
            </Button>
          </>
        ) : fine ? (
          <>
            <p className="text-sm">{t("recipes.tidy.fine")}</p>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>
                {t("recipes.tidy.done")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            {ai.why && (
              <NeedsAi
                task="tidy"
                why={ai.why}
                onNavigate={() => onOpenChange(false)}
              />
            )}
            <fieldset className="grid gap-2.5" disabled={busy}>
              <legend className="mb-2 text-sm font-medium">
                {t("recipes.tidy.what")}
              </legend>
              {SECTIONS.map((section) => (
                <Field key={section} orientation="horizontal">
                  <Checkbox
                    id={`tidy-${section}`}
                    checked={picked.has(section)}
                    onCheckedChange={(checked) =>
                      setPicked((now) => {
                        const next = new Set(now)
                        if (checked) next.add(section)
                        else next.delete(section)
                        return next
                      })
                    }
                  />
                  <FieldLabel
                    htmlFor={`tidy-${section}`}
                    className="font-normal"
                  >
                    {t(`recipes.tidy.options.${section}`)}
                  </FieldLabel>
                </Field>
              ))}
            </fieldset>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : (
              busy && (
                <p aria-live="polite" className="text-sm text-muted-foreground">
                  {t("recipes.tidy.slow")}
                </p>
              )
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                {t("recipes.tidy.cancel")}
              </Button>
              <Button
                disabled={busy || picked.size === 0 || ai.ready === false}
                onClick={() => void tidy()}
              >
                {busy && <Spinner data-icon="inline-start" />}
                {busy ? t("recipes.tidy.tidying") : t("recipes.tidy.start")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
