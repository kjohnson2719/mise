import type { ErrorComponentProps } from "@tanstack/react-router"
import { Link } from "@tanstack/react-router"
import { useEffect } from "react"
import { useTranslation } from "react-i18next"

import { Logo } from "@/components/brand/logo"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { reportError } from "@/features/error-tracking/start"

function StatusPage({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action: React.ReactNode
}) {
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <Empty>
        <EmptyHeader>
          <Logo showWordmark={false} className="mb-2" />
          <EmptyTitle>{title}</EmptyTitle>
          <EmptyDescription>{description}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>{action}</EmptyContent>
      </Empty>
    </div>
  )
}

export function NotFound() {
  const { t } = useTranslation()
  return (
    <StatusPage
      title={t("status.notFound.title")}
      description={t("status.notFound.description")}
      action={<Button render={<Link to="/" />}>{t("status.home")}</Button>}
    />
  )
}

export function RouteError({ error, reset }: ErrorComponentProps) {
  const { t } = useTranslation()
  useEffect(() => reportError(error), [error])
  return (
    <StatusPage
      title={t("status.error.title")}
      description={t("status.error.description")}
      action={<Button onClick={reset}>{t("status.tryAgain")}</Button>}
    />
  )
}
