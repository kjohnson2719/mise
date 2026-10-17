import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useForm } from "react-hook-form"
import { Trans, useTranslation } from "react-i18next"

import { AuthLayout } from "@/components/layout/auth-layout"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import {
  AccountFields,
  EMPTY_ACCOUNT,
  type AccountForm,
} from "@/features/auth/account-fields"
import { meQuery } from "@/features/auth/queries"
import { api, ApiError, unwrap } from "@/lib/api/client"
import { showFormError } from "@/lib/form-errors"

export const Route = createFileRoute("/join/$token")({
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(meQuery)
    try {
      const invite = await unwrap(
        api.GET("/api/auth/join/{token}", {
          params: { path: { token: params.token } },
        })
      )
      return { invite, problem: null }
    } catch (error) {
      if (error instanceof ApiError && error.status < 500) {
        return { invite: null, problem: error.code }
      }
      throw error
    }
  },
  component: JoinPage,
})

function JoinPage() {
  const { t } = useTranslation()
  const { token } = Route.useParams()
  const { invite, problem } = Route.useLoaderData()
  const { data: me } = useSuspenseQuery(meQuery)

  if (!invite) {
    return (
      <AuthLayout
        title={t("auth.join.unusableTitle")}
        description={
          problem === "invite_used"
            ? t("auth.join.used")
            : problem === "invite_expired"
              ? t("auth.join.expired")
              : t("auth.join.notFound")
        }
      >
        <Button className="w-full" render={<Link to="/" />}>
          {t("status.home")}
        </Button>
      </AuthLayout>
    )
  }

  const title = t("auth.join.title", { household: invite.household.name })
  return me ? (
    <JoinSignedIn token={token} title={title} />
  ) : (
    <JoinWithAccount token={token} title={title} />
  )
}

function JoinSignedIn({ token, title }: { token: string; title: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const form = useForm()
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async () => {
    try {
      await unwrap(
        api.POST("/api/auth/join/{token}", {
          params: { path: { token } },
          body: {},
        })
      )
      queryClient.removeQueries()
      await navigate({ to: "/" })
    } catch (error) {
      if (!showFormError(form.setError, error)) throw error
    }
  })

  return (
    <AuthLayout title={title} description={t("auth.join.signedIn")}>
      <form onSubmit={onSubmit}>
        <FieldGroup>
          {errors.root && (
            <Alert variant="destructive">
              <AlertDescription>
                {errors.root.message as string}
              </AlertDescription>
            </Alert>
          )}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Spinner />}
            {t("auth.join.submit")}
          </Button>
        </FieldGroup>
      </form>
    </AuthLayout>
  )
}

function JoinWithAccount({ token, title }: { token: string; title: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const form = useForm<AccountForm>({ defaultValues: EMPTY_ACCOUNT })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async (account) => {
    try {
      const me = await unwrap(
        api.POST("/api/auth/join/{token}", {
          params: { path: { token } },
          body: { account },
        })
      )
      queryClient.setQueryData(meQuery.queryKey, me)
      await navigate({ to: "/" })
    } catch (error) {
      const rename = {
        "account.name": "name",
        "account.email": "email",
        "account.username": "username",
        "account.password": "password",
      } as const
      if (!showFormError(form.setError, error, rename)) throw error
    }
  })

  return (
    <AuthLayout
      title={title}
      description={t("auth.join.newAccount")}
      footer={
        <Trans
          i18nKey="auth.join.haveAccount"
          components={{
            link: (
              <Link
                to="/login"
                search={{ redirect: `/join/${token}` }}
                className="font-medium text-primary hover:underline"
              />
            ),
          }}
        />
      }
    >
      <form onSubmit={onSubmit} noValidate>
        <FieldGroup>
          {errors.root && (
            <Alert variant="destructive">
              <AlertDescription>{errors.root.message}</AlertDescription>
            </Alert>
          )}
          <AccountFields register={form.register} errors={errors} />
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Spinner />}
            {t("auth.join.submitNew")}
          </Button>
        </FieldGroup>
      </form>
    </AuthLayout>
  )
}
