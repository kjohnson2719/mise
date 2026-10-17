import { useQueryClient } from "@tanstack/react-query"
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"

import { TextField } from "@/components/form/text-field"
import { AuthLayout } from "@/components/layout/auth-layout"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { meQuery } from "@/features/auth/queries"
import { api, ApiError, unwrap } from "@/lib/api/client"

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } =>
    typeof search.redirect === "string" ? { redirect: search.redirect } : {},
  beforeLoad: async ({ context }) => {
    if (await context.queryClient.ensureQueryData(meQuery)) {
      throw redirect({ to: "/" })
    }
  },
  component: LoginPage,
})

/** Only ever go back to a page on this site. */
function safeRedirect(target: string | undefined) {
  return target?.startsWith("/") && !target.startsWith("//") ? target : "/"
}

type Form = { identifier: string; password: string }

function LoginPage() {
  const { t } = useTranslation()
  const { redirect: back } = Route.useSearch()
  const queryClient = useQueryClient()
  const router = useRouter()
  const form = useForm<Form>({
    defaultValues: { identifier: "", password: "" },
  })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async ({ identifier, password }) => {
    try {
      const value = identifier.trim()
      await unwrap(
        value.includes("@")
          ? api.POST("/api/auth/sign-in/email", {
              body: { email: value, password },
            })
          : api.POST("/api/auth/sign-in/username", {
              body: { username: value, password },
            })
      )
      queryClient.removeQueries()
      router.history.push(safeRedirect(back))
    } catch (error) {
      const message =
        error instanceof ApiError && error.status === 429
          ? t("auth.login.tooMany")
          : error instanceof ApiError && error.status < 500
            ? t("auth.login.wrong")
            : t("status.error.description")
      form.setError("root", { message })
    }
  })

  return (
    <AuthLayout
      title={t("auth.login.title")}
      description={t("auth.login.description")}
    >
      <form onSubmit={onSubmit} noValidate>
        <FieldGroup>
          {errors.root && (
            <Alert variant="destructive">
              <AlertDescription>{errors.root.message}</AlertDescription>
            </Alert>
          )}
          <TextField
            label={t("auth.fields.usernameOrEmail")}
            autoComplete="username"
            autoCapitalize="none"
            required
            {...form.register("identifier", { required: true })}
          />
          <TextField
            label={t("auth.fields.password")}
            type="password"
            autoComplete="current-password"
            required
            {...form.register("password", { required: true })}
          />
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Spinner />}
            {t("auth.login.submit")}
          </Button>
        </FieldGroup>
      </form>
    </AuthLayout>
  )
}
