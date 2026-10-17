import { useNavigate } from "@tanstack/react-router"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { TextField } from "@/components/form/text-field"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { useRefreshAll } from "@/features/auth/use-me"
import { api, unwrap } from "@/lib/api/client"
import { showFormError } from "@/lib/form-errors"

/** Server admins can start more households, and switch to the new one. */
export function NewHouseholdCard() {
  const { t } = useTranslation()
  const refreshAll = useRefreshAll()
  const navigate = useNavigate()
  const form = useForm<{ name: string }>({ defaultValues: { name: "" } })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async ({ name }) => {
    try {
      const household = await unwrap(
        api.POST("/api/households", { body: { name } })
      )
      toast.success(
        t("settings.household.new.started", { name: household.name })
      )
      await refreshAll()
      await navigate({ to: "/settings/household" })
      form.reset()
    } catch (error) {
      if (!showFormError(form.setError, error)) throw error
    }
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.household.new.title")}</CardTitle>
        <CardDescription>
          {t("settings.household.new.description")}
        </CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit} noValidate>
        <CardContent>
          <TextField
            label={t("settings.household.details.name")}
            error={errors.name?.message ?? errors.root?.message}
            {...form.register("name", {
              validate: (value) =>
                value.trim() !== "" ||
                t("settings.household.details.nameNeeded"),
            })}
          />
        </CardContent>
        <CardFooter className="mt-6 justify-end">
          <Button type="submit" variant="outline" disabled={isSubmitting}>
            {isSubmitting && <Spinner />}
            {t("settings.household.new.submit")}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}
