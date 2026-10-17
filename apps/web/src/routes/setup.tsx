import { useQueryClient } from "@tanstack/react-query"
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"

import { TextField } from "@/components/form/text-field"
import { AuthLayout } from "@/components/layout/auth-layout"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { FieldGroup, FieldSeparator } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import {
  AccountFields,
  EMPTY_ACCOUNT,
  type AccountForm,
} from "@/features/auth/account-fields"
import { meQuery, setupQuery } from "@/features/auth/queries"
import { api, unwrap } from "@/lib/api/client"
import { showFormError } from "@/lib/form-errors"

export const Route = createFileRoute("/setup")({
  beforeLoad: async ({ context }) => {
    const setup = await context.queryClient.fetchQuery(setupQuery)
    if (!setup.needed) throw redirect({ to: "/login" })
  },
  component: SetupPage,
})

type Form = AccountForm & { code: string; household: string }

function SetupPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const form = useForm<Form>({
    defaultValues: { ...EMPTY_ACCOUNT, code: "", household: "" },
  })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const me = await unwrap(api.POST("/api/auth/setup", { body: values }))
      queryClient.setQueryData(meQuery.queryKey, me)
      queryClient.removeQueries({ queryKey: setupQuery.queryKey })
      await navigate({ to: "/" })
    } catch (error) {
      if (!showFormError(form.setError, error)) throw error
    }
  })

  return (
    <AuthLayout
      title={t("auth.setup.title")}
      description={t("auth.setup.description")}
    >
      <form onSubmit={onSubmit} noValidate>
        <FieldGroup>
          {errors.root && (
            <Alert variant="destructive">
              <AlertDescription>{errors.root.message}</AlertDescription>
            </Alert>
          )}
          <TextField
            label={t("auth.setup.code")}
            description={t("auth.setup.codeHint")}
            autoComplete="one-time-code"
            autoCapitalize="characters"
            error={errors.code?.message}
            {...form.register("code")}
          />
          <FieldSeparator />
          <AccountFields register={form.register} errors={errors} />
          <TextField
            label={t("auth.setup.household")}
            description={t("auth.setup.householdHint")}
            error={errors.household?.message}
            {...form.register("household")}
          />
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Spinner />}
            {t("auth.setup.submit")}
          </Button>
        </FieldGroup>
      </form>
    </AuthLayout>
  )
}
