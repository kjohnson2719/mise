import { useSuspenseQuery } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { LockedNote } from "@/features/settings/setting-fields"
import { ApiError } from "@/lib/api/client"
import { formatRelativeDate } from "@/lib/format"

import { serverSettingsQuery, useSaveServerSettings } from "./queries"

const KEY = "sites.enabled"

/**
 * Recipe sites: whether Merran reads them in the background, for following
 * sites and starter collections, and what it has from them.
 */
export function SitesCard() {
  const { t, i18n } = useTranslation()
  const { data } = useSuspenseQuery(serverSettingsQuery)
  const save = useSaveServerSettings()
  const [saving, setSaving] = React.useState(false)
  const id = React.useId()
  const labelId = React.useId()
  const state = data.settings.find((s) => s.key === KEY)
  const on = state?.value === true
  const { sites, recipes, classics, readAt } = data.sites

  async function change(next: boolean) {
    setSaving(true)
    try {
      await save({ [KEY]: next })
      toast.success(t("settings.server.sites.saved"))
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      toast.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.server.sites.title")}</CardTitle>
        <CardDescription>
          {t("settings.server.sites.description")}
        </CardDescription>
        <CardAction>
          <Badge variant={on ? "default" : "secondary"}>
            {on ? t("common.on") : t("common.off")}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <ul className="grid gap-1 text-sm">
            <li>
              {t("settings.server.sites.shelf", {
                count: recipes,
                sites,
              })}
            </li>
            <li>
              {t("settings.server.sites.classics", {
                working: classics.working,
                count: classics.all,
              })}
            </li>
            <li className="text-muted-foreground">
              {readAt
                ? t("settings.server.sites.readAt", {
                    when: formatRelativeDate(readAt, i18n.language),
                  })
                : t("settings.server.sites.notRead")}
            </li>
          </ul>
          {state && (
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel id={labelId} htmlFor={id}>
                  {t("settings.server.sites.enabled")}
                </FieldLabel>
                <FieldDescription>
                  {state.lockedBy ? (
                    <LockedNote state={state} />
                  ) : (
                    t("settings.server.sites.enabledHint")
                  )}
                </FieldDescription>
              </FieldContent>
              {saving && <Spinner />}
              <Switch
                id={id}
                aria-labelledby={labelId}
                checked={on}
                onCheckedChange={(next) => void change(next)}
                disabled={saving || state.lockedBy !== null}
              />
            </Field>
          )}
        </FieldGroup>
      </CardContent>
    </Card>
  )
}
