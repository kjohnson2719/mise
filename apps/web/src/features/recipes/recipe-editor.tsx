import { joinSections } from "@merran/shared"
import { useBlocker, useNavigate } from "@tanstack/react-router"
import * as React from "react"
import { Controller, useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { TextareaField } from "@/components/form/textarea-field"
import { TextField } from "@/components/form/text-field"
import { PageHeader } from "@/components/layout/page-header"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { FieldGroup, FieldLegend, FieldSet } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { api, ApiError, unwrap } from "@/lib/api/client"

import { useRefreshRecipes, type Recipe, type RecipeInput } from "./queries"
import { RatingInput } from "./rating-stars"
import { TagsField } from "./tags-field"

type Form = {
  name: string
  description: string
  sourceUrl: string
  servings: string
  yieldText: string
  prepMinutes: string
  cookMinutes: string
  totalMinutes: string
  rating: number | null
  tags: string[]
  ingredients: string
  steps: string
  notes: string
}

const FORM_ID = "recipe-editor"

/** The form as it starts: the recipe's own values, or empty for a new one. */
function startingValues(recipe?: Recipe): Form {
  const text = (value: number | null | undefined) =>
    value === null || value === undefined ? "" : String(value)
  return {
    name: recipe?.name ?? "",
    description: recipe?.description ?? "",
    sourceUrl: recipe?.sourceUrl ?? "",
    servings: text(recipe?.servings),
    yieldText: recipe?.yieldText ?? "",
    prepMinutes: text(recipe?.prepMinutes),
    cookMinutes: text(recipe?.cookMinutes),
    totalMinutes: text(recipe?.totalMinutes),
    rating: recipe?.rating ?? null,
    tags: recipe?.tags ?? [],
    ingredients: recipe ? joinSections(recipe.ingredients).join("\n") : "",
    steps: recipe ? joinSections(recipe.steps).join("\n") : "",
    notes: recipe?.notes ?? "",
  }
}

const orNull = (value: string) => value.trim() || null
const numberOrNull = (value: string) =>
  value.trim() === "" ? null : Number(value)

function toInput(form: Form): RecipeInput {
  return {
    name: form.name,
    description: orNull(form.description),
    sourceUrl: orNull(form.sourceUrl),
    servings: numberOrNull(form.servings),
    yieldText: orNull(form.yieldText),
    prepMinutes: numberOrNull(form.prepMinutes),
    cookMinutes: numberOrNull(form.cookMinutes),
    totalMinutes: numberOrNull(form.totalMinutes),
    rating: form.rating,
    tags: form.tags,
    ingredients: form.ingredients.split("\n"),
    steps: form.steps.split("\n"),
    notes: orNull(form.notes),
  }
}

/** Adding a recipe by typing it in, or changing one. */
export function RecipeEditor({ recipe }: { recipe?: Recipe }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const refresh = useRefreshRecipes()
  const form = useForm<Form>({ defaultValues: startingValues(recipe) })
  const { errors, isDirty, isSubmitting } = form.formState
  const saved = React.useRef(false)

  // Leaving with changes not saved asks first.
  useBlocker({
    shouldBlockFn: () =>
      isDirty && !saved.current && !window.confirm(t("recipes.editor.leave")),
    enableBeforeUnload: () => isDirty && !saved.current,
  })

  const whole = (minimum: number) => ({
    validate: (value: string) =>
      value.trim() === "" ||
      (Number.isInteger(Number(value)) && Number(value) >= minimum) ||
      t("recipes.editor.wholeNumber"),
  })

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const body = toInput(values)
      const result = recipe
        ? await unwrap(
            api.PUT("/api/recipes/{recipe}", {
              params: { path: { recipe: recipe.id } },
              body,
            })
          )
        : await unwrap(api.POST("/api/recipes", { body }))
      saved.current = true
      await refresh()
      toast.success(
        recipe ? t("recipes.editor.saved") : t("recipes.editor.added")
      )
      await navigate({ to: "/recipes/$slug", params: { slug: result.slug } })
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      const fields = Object.entries(error.fields)
      // "ingredients.12" is a problem with one line of the ingredients.
      for (const [field, message] of fields) {
        form.setError(field.split(".")[0] as keyof Form, { message })
      }
      if (fields.length === 0) form.setError("root", { message: error.message })
    }
  })

  const cancel = () =>
    recipe
      ? navigate({ to: "/recipes/$slug", params: { slug: recipe.slug } })
      : navigate({ to: "/recipes" })

  const actions = (
    <>
      <Button variant="outline" type="button" onClick={cancel}>
        {t("common.cancel")}
      </Button>
      <Button type="submit" form={FORM_ID} disabled={isSubmitting}>
        {isSubmitting && <Spinner />}
        {recipe ? t("common.save") : t("recipes.editor.add")}
      </Button>
    </>
  )

  return (
    <>
      <PageHeader
        title={
          recipe ? t("recipes.editor.editTitle") : t("recipes.editor.newTitle")
        }
        actions={actions}
      />
      <form id={FORM_ID} onSubmit={onSubmit} noValidate className="space-y-6">
        {errors.root && (
          <Alert variant="destructive">
            <AlertDescription>{errors.root.message}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>{t("recipes.editor.about")}</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <TextField
                label={t("recipes.fields.name")}
                autoFocus={!recipe}
                error={errors.name?.message}
                {...form.register("name", {
                  validate: (value) =>
                    value.trim() !== "" || t("recipes.editor.nameNeeded"),
                })}
              />
              <TextareaField
                label={t("recipes.fields.description")}
                rows={2}
                error={errors.description?.message}
                {...form.register("description")}
              />
              <TextField
                label={t("recipes.fields.source")}
                type="url"
                inputMode="url"
                placeholder="https://"
                error={errors.sourceUrl?.message}
                {...form.register("sourceUrl")}
              />
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("recipes.editor.details")}</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <div className="grid gap-6 sm:grid-cols-2">
                <TextField
                  label={t("recipes.fields.servings")}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  error={errors.servings?.message}
                  {...form.register("servings")}
                />
                <TextField
                  label={t("recipes.fields.yield")}
                  description={t("recipes.editor.yieldHint")}
                  error={errors.yieldText?.message}
                  {...form.register("yieldText")}
                />
              </div>
              <div className="grid gap-6 sm:grid-cols-3">
                <TextField
                  label={t("recipes.fields.prepMinutes")}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  error={errors.prepMinutes?.message}
                  {...form.register("prepMinutes", whole(0))}
                />
                <TextField
                  label={t("recipes.fields.cookMinutes")}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  error={errors.cookMinutes?.message}
                  {...form.register("cookMinutes", whole(0))}
                />
                <TextField
                  label={t("recipes.fields.totalMinutes")}
                  description={t("recipes.editor.totalHint")}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  error={errors.totalMinutes?.message}
                  {...form.register("totalMinutes", whole(0))}
                />
              </div>
              <FieldSet>
                <FieldLegend variant="label">
                  {t("recipes.fields.rating")}
                </FieldLegend>
                <Controller
                  control={form.control}
                  name="rating"
                  render={({ field }) => (
                    <RatingInput
                      value={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />
              </FieldSet>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("recipes.fields.ingredients")}</CardTitle>
            <CardDescription>
              {t("recipes.editor.ingredientsHint")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TextareaField
              label={t("recipes.fields.ingredients")}
              hideLabel
              className="min-h-48"
              placeholder={t("recipes.editor.ingredientsPlaceholder")}
              error={errors.ingredients?.message}
              {...form.register("ingredients")}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("recipes.fields.steps")}</CardTitle>
            <CardDescription>{t("recipes.editor.stepsHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <TextareaField
              label={t("recipes.fields.steps")}
              hideLabel
              className="min-h-48"
              placeholder={t("recipes.editor.stepsPlaceholder")}
              error={errors.steps?.message}
              {...form.register("steps")}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("recipes.editor.tagsAndNotes")}</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Controller
                control={form.control}
                name="tags"
                render={({ field }) => (
                  <TagsField
                    value={field.value}
                    onChange={field.onChange}
                    error={errors.tags?.message}
                  />
                )}
              />
              <TextareaField
                label={t("recipes.fields.notes")}
                description={t("recipes.editor.notesHint")}
                rows={3}
                error={errors.notes?.message}
                {...form.register("notes")}
              />
            </FieldGroup>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">{actions}</div>
      </form>
    </>
  )
}
