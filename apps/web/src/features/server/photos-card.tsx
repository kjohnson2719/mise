import { useSuspenseQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { FieldGroup } from "@/components/ui/field"

import { serverSettingsQuery } from "./queries"
import { ServerSwitch } from "./server-switch"

/**
 * AI photos: whether the server makes them, on households' OpenAI or
 * Google keys, and whether by itself for each new recipe.
 */
export function PhotosCard() {
  const { t } = useTranslation()
  const { data } = useSuspenseQuery(serverSettingsQuery)
  const on =
    data.settings.find((s) => s.key === "photos.enabled")?.value === true

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.server.photos.title")}</CardTitle>
        <CardDescription>
          {t("settings.server.photos.description")}
        </CardDescription>
        <CardAction>
          <Badge variant={on ? "default" : "secondary"}>
            {on ? t("common.on") : t("common.off")}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <ServerSwitch
            settingKey="photos.enabled"
            label={t("settings.server.photos.enabled")}
            description={t("settings.server.photos.enabledHint")}
          />
          <ServerSwitch
            settingKey="photos.auto"
            label={t("settings.server.photos.auto")}
            description={t("settings.server.photos.autoHint")}
            disabled={!on}
          />
        </FieldGroup>
      </CardContent>
    </Card>
  )
}
