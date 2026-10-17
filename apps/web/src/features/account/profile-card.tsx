import { useQueryClient } from "@tanstack/react-query"
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
import { meQuery } from "@/features/auth/queries"
import { useMe } from "@/features/auth/use-me"
import { api, ApiError, unwrap } from "@/lib/api/client"

type Form = { name: string; username: string }

/** Your name and username. The email address can't be changed yet. */
export function ProfileCard() {
  const { t } = useTranslation()
  const me = useMe()
  const queryClient = useQueryClient()
  const form = useForm<Form>({
    values: { name: me.name, username: me.username ?? "" },
  })
  const { errors, isSubmitting, isDirty } = form.formState

  const onSubmit = form.handleSubmit(async ({ name, username }) => {
    try {
      await unwrap(
        api.POST("/api/auth/update-user", {
          body: { name: name.trim(), username: username.trim() },
        })
      )
      await queryClient.invalidateQueries({ queryKey: meQuery.queryKey })
      toast.success(t("settings.you.profile.saved"))
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      if (error.code.startsWith("USERNAME")) {
        form.setError("username", { message: error.message })
      } else {
        form.setError("root", { message: error.message })
      }
    }
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.you.profile.title")}</CardTitle>
        <CardDescription>
          {t("settings.you.profile.description")}
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
              label={t("auth.fields.name")}
              autoComplete="name"
              error={errors.name?.message}
              {...form.register("name", {
                validate: (value) =>
                  value.trim() !== "" || t("settings.you.profile.nameNeeded"),
              })}
            />
            <TextField
              label={t("auth.fields.username")}
              description={t("auth.fields.usernameHint")}
              autoComplete="username"
              autoCapitalize="none"
              error={errors.username?.message}
              {...form.register("username")}
            />
            <TextField
              label={t("auth.fields.email")}
              description={t("settings.you.profile.emailFixed")}
              value={me.email}
              readOnly
              disabled
            />
          </FieldGroup>
        </CardContent>
        <CardFooter className="mt-6 justify-end">
          <Button type="submit" disabled={!isDirty || isSubmitting}>
            {isSubmitting && <Spinner />}
            {t("common.save")}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}
