import { CookBookIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Link } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { AddRecipeDialog } from "@/features/recipes/add-recipe-dialog"

const STEPS = ["recipes", "plan", "shop"] as const

/** A household with no recipes yet: three steps to dinner. */
export function Welcome() {
  const { t } = useTranslation()
  return (
    <section
      aria-labelledby="welcome"
      className="grid gap-6 rounded-3xl border bg-card p-6 text-card-foreground md:p-8"
    >
      <div className="flex items-center gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
          <HugeiconsIcon icon={CookBookIcon} strokeWidth={2} />
        </span>
        <div>
          <h2 id="welcome" className="font-heading text-2xl font-semibold">
            {t("today.welcome.title")}
          </h2>
          <p className="text-muted-foreground">{t("today.welcome.subtitle")}</p>
        </div>
      </div>
      <ol className="grid gap-4 md:grid-cols-3">
        {STEPS.map((step, index) => (
          <li key={step} className="grid content-start gap-1">
            <span className="text-sm font-semibold text-primary">
              {index + 1}
            </span>
            <span className="font-medium">
              {t(`today.welcome.${step}.title`)}
            </span>
            <span className="text-sm text-muted-foreground">
              {t(`today.welcome.${step}.text`)}
            </span>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <AddRecipeDialog
          trigger={<Button size="lg">{t("today.welcome.addRecipe")}</Button>}
        />
        <Button size="lg" variant="outline" render={<Link to="/recipes/new" />}>
          {t("today.welcome.writeOne")}
        </Button>
        <Button
          size="lg"
          variant="outline"
          render={<Link to="/settings/import-export" />}
        >
          {t("today.welcome.import")}
        </Button>
      </div>
    </section>
  )
}
