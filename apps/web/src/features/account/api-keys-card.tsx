import { Delete02Icon, Key01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/confirm-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { api, unwrap } from "@/lib/api/client"
import { formatDate } from "@/lib/format"

import { AREAS } from "./api-key-areas"
import { NewApiKeyDialog } from "./new-api-key-dialog"
import { apiKeysQuery, type ApiKey } from "./queries"

/** Keys for other apps, like Home Assistant, to use the API as you. */
export function ApiKeysCard() {
  const { t } = useTranslation()
  const { data: keys } = useSuspenseQuery(apiKeysQuery)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.you.apiKeys.title")}</CardTitle>
        <CardDescription>
          {t("settings.you.apiKeys.description")}
        </CardDescription>
        <CardAction>
          <NewApiKeyDialog />
        </CardAction>
      </CardHeader>
      <CardContent>
        {keys.length === 0 ? (
          <Empty className="rounded-2xl border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={Key01Icon} strokeWidth={2} />
              </EmptyMedia>
              <EmptyTitle>{t("settings.you.apiKeys.none")}</EmptyTitle>
              <EmptyDescription>
                {t("settings.you.apiKeys.noneHint")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="divide-y rounded-2xl border">
            {keys.map((key) => (
              <ApiKeyRow key={key.id} apiKey={key} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function ApiKeyRow({ apiKey }: { apiKey: ApiKey }) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const date = (iso: string) => formatDate(iso, i18n.language)

  const granted = AREAS.flatMap((area) => {
    const access = apiKey.permissions[area]
    return access
      ? [
          t("settings.you.apiKeys.grant", {
            area: t(`settings.you.apiKeys.areas.${area}`),
            access: t(`settings.you.apiKeys.access.${access}`),
          }),
        ]
      : []
  })

  async function revoke() {
    await unwrap(
      api.DELETE("/api/auth/api-keys/{keyId}", {
        params: { path: { keyId: apiKey.id } },
      })
    )
    await queryClient.invalidateQueries({ queryKey: apiKeysQuery.queryKey })
    toast.success(t("settings.you.apiKeys.revoked", { name: apiKey.name }))
  }

  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{apiKey.name}</span>
          <code className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
            {apiKey.start}…
          </code>
          <Badge variant="secondary">{apiKey.household.name}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {granted.length > 0
            ? granted.join(" · ")
            : t("settings.you.apiKeys.noAccess")}
        </p>
        <p className="text-xs text-muted-foreground">
          {[
            t("settings.you.apiKeys.made", { date: date(apiKey.createdAt) }),
            apiKey.expiresAt
              ? t("settings.you.apiKeys.expires", {
                  date: date(apiKey.expiresAt),
                })
              : t("settings.you.apiKeys.neverExpires"),
            apiKey.lastUsedAt
              ? t("settings.you.apiKeys.lastUsed", {
                  date: date(apiKey.lastUsedAt),
                })
              : t("settings.you.apiKeys.neverUsed"),
          ].join(" · ")}
        </p>
      </div>
      <ConfirmDialog
        trigger={
          <Button variant="outline" size="sm" className="self-start">
            <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
            {t("settings.you.apiKeys.revoke")}
          </Button>
        }
        title={t("settings.you.apiKeys.revokeTitle", { name: apiKey.name })}
        description={t("settings.you.apiKeys.revokeDescription")}
        confirm={t("settings.you.apiKeys.revoke")}
        onConfirm={revoke}
      />
    </li>
  )
}
