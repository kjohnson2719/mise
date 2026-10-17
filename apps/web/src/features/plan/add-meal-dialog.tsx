import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RecipePicker } from "@/features/recipes/recipe-picker"

import type { Meal } from "./queries"
import { usePlanActions } from "./use-plan-actions"

/** Where the meal goes, and how it's named in the title: "Add to Thursday's dinner". */
export type Slot = {
  date: string
  meal: Meal
  anyDay: boolean
  /** "Thursday, Oct 15 · Dinner", or "This week, any day". */
  label: string
}

/** Putting a meal on the plan: a recipe, picked, or a note. */
export function AddMealDialog({
  slot,
  onOpenChange,
}: {
  slot: Slot | null
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const actions = usePlanActions()
  const [note, setNote] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  async function add(
    body: { recipe: string } | { note: string },
    name: string
  ) {
    if (!slot) return
    setBusy(true)
    const added = await actions.add({
      date: slot.date,
      meal: slot.meal,
      anyDay: slot.anyDay,
      ...body,
    })
    setBusy(false)
    if (!added) return
    toast.success(t("plan.added", { name }))
    setNote("")
    onOpenChange(false)
  }

  return (
    <Dialog
      open={slot !== null}
      onOpenChange={(open) => {
        if (!open) setNote("")
        onOpenChange(open)
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t("plan.addTo", { when: slot?.label ?? "" })}
          </DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="recipe" className="min-w-0">
          <TabsList className="w-full">
            <TabsTrigger value="recipe">{t("plan.pick.recipe")}</TabsTrigger>
            <TabsTrigger value="note">{t("plan.pick.note")}</TabsTrigger>
          </TabsList>
          <TabsContent value="recipe" className="pt-2">
            <RecipePicker
              label={t("plan.pick.find")}
              onPick={(recipe) => void add({ recipe: recipe.id }, recipe.name)}
            />
          </TabsContent>
          <TabsContent value="note" className="pt-2">
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                if (note.trim()) void add({ note: note.trim() }, note.trim())
              }}
            >
              <Input
                autoFocus
                maxLength={200}
                placeholder={t("plan.pick.notePlaceholder")}
                aria-label={t("plan.pick.note")}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
              <Button type="submit" disabled={!note.trim() || busy}>
                {busy && <Spinner data-icon="inline-start" />}
                {t("plan.pick.addNote")}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
