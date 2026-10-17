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
 * Walmart through Merran's browser extension: experimental, so off until
 * the server admin turns it on.
 */
export function WalmartCard() {
  const { t } = useTranslation()
  const { data } = useSuspenseQuery(serverSettingsQuery)
  const on =
    data.settings.find((s) => s.key === "stores.walmart")?.value === true

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.server.walmart.title")}</CardTitle>
        <CardDescription>
          {t("settings.server.walmart.description")}
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
            settingKey="stores.walmart"
            label={t("settings.server.walmart.switch")}
            description={t("settings.server.walmart.switchHint")}
          />
        </FieldGroup>
      </CardContent>
    </Card>
  )
}
