import { useSuspenseQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

import { serverSettingsQuery } from "./queries"
import { UpdatesSection } from "./updates"

/**
 * What's running: the version, how it was installed, and its database; and
 * whether there's a newer Merran, with how to update.
 */
export function AboutCard() {
  const { t } = useTranslation()
  const { data } = useSuspenseQuery(serverSettingsQuery)
  const { about } = data

  const rows = [
    [t("settings.server.about.version"), about.version],
    [
      t("settings.server.about.installed"),
      t(`settings.server.about.install.${about.installMethod}`),
    ],
    [
      t("settings.server.about.database"),
      t(`settings.server.about.databases.${about.database}`),
    ],
    [
      t("settings.server.about.address"),
      about.publicUrl ?? t("settings.server.about.noAddress"),
    ],
  ] as const

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.server.about.title")}</CardTitle>
        <CardDescription>
          {t("settings.server.about.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[auto_1fr]">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-medium break-all">{value}</dd>
            </div>
          ))}
        </dl>
        <UpdatesSection />
      </CardContent>
    </Card>
  )
}
