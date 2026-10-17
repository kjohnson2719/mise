import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { TextField } from "@/components/form/text-field"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { FieldGroup } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { api, ApiError, unwrap } from "@/lib/api/client"

type Form = { currentPassword: string; newPassword: string }

const EMPTY: Form = { currentPassword: "", newPassword: "" }

/** Changing your password signs you out everywhere else. */
export function PasswordCard() {
  const { t } = useTranslation()
  const form = useForm<Form>({ defaultValues: EMPTY })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await unwrap(
        api.POST("/api/auth/change-password", {
          body: { ...values, revokeOtherSessions: true },
        })
      )
      form.reset(EMPTY)
      toast.success(t("settings.you.password.changed"))
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      if (error.code === "INVALID_PASSWORD") {
        form.setError("currentPassword", {
          message: t("settings.you.password.wrong"),
        })
      } else if (error.code.startsWith("PASSWORD_TOO")) {
        form.setError("newPassword", { message: error.message })
      } else {
        form.setError("root", { message: error.message })
      }
    }
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.you.password.title")}</CardTitle>
        <CardDescription>
          {t("settings.you.password.description")}
        </CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit} noValidate>
        <CardContent>
          <FieldGroup>
            {errors.root && (
              <Alert variant="destructive">
                <AlertDescription>{errors.root.message}</AlertDescription>
              </Alert>
            )}
            <TextField
              label={t("settings.you.password.current")}
              type="password"
              autoComplete="current-password"
              error={errors.currentPassword?.message}
              {...form.register("currentPassword", {
                required: t("settings.you.password.currentNeeded"),
              })}
            />
            <TextField
              label={t("settings.you.password.new")}
              description={t("auth.fields.passwordHint")}
              type="password"
              autoComplete="new-password"
              error={errors.newPassword?.message}
              {...form.register("newPassword", {
                minLength: {
                  value: 10,
                  message: t("auth.fields.passwordHint"),
                },
                required: t("auth.fields.passwordHint"),
              })}
            />
          </FieldGroup>
        </CardContent>
        <CardFooter className="mt-6 justify-end">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Spinner />}
            {t("settings.you.password.submit")}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}
