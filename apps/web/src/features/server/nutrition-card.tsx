import { useSuspenseQuery } from "@tanstack/react-query"
import * as React from "react"
import { Trans, useTranslation } from "react-i18next"
import { toast } from "sonner"

import { TextField } from "@/components/form/text-field"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { FieldGroup } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { LockedNote } from "@/features/settings/setting-fields"
import { api, ApiError, unwrap } from "@/lib/api/client"

import { serverSettingsQuery, useSaveServerSettings } from "./queries"

const KEY = "nutrition.usdaKey"

/**
 * The USDA FoodData Central key that works nutrition out from the
 * ingredients: free from api.data.gov. Without one, AI estimates it.
 */
export function NutritionCard() {
  const { t } = useTranslation()
  const { data } = useSuspenseQuery(serverSettingsQuery)
  const save = useSaveServerSettings()
  const state = data.settings.find((s) => s.key === KEY)
  const [key, setKey] = React.useState("")
  const [busy, setBusy] = React.useState<"save" | "test" | "remove" | null>(
    null
  )
  if (!state) return null
  const set = state.source !== "default"
  const locked = state.lockedBy !== null

  async function test(usdaKey?: string) {
    setBusy("test")
    try {
      const tested = await unwrap(
        api.POST("/api/settings/server/nutrition/test", {
          body: usdaKey ? { usdaKey } : {},
        })
      )
      toast.success(
        t("settings.server.nutrition.works", { found: tested.found })
      )
      return true
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
      return false
    } finally {
      setBusy(null)
    }
  }

  async function saveKey(value: string | null) {
    if (value && !(await test(value))) return
    setBusy(value ? "save" : "remove")
    try {
      await save({ [KEY]: value })
      setKey("")
      toast.success(
        value
          ? t("settings.server.nutrition.saved")
          : t("settings.server.nutrition.removed")
      )
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.server.nutrition.title")}</CardTitle>
        <CardDescription>
          <Trans
            i18nKey="settings.server.nutrition.description"
            components={{
              link: (
                <a
                  href="https://api.data.gov/signup/"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="underline underline-offset-3"
                />
              ),
            }}
          />
        </CardDescription>
        <CardAction>
          <Badge variant={set ? "default" : "secondary"}>
            {set ? t("common.on") : t("common.off")}
          </Badge>
        </CardAction>
      </CardHeader>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          if (key.trim()) void saveKey(key.trim())
        }}
      >
        <CardContent>
          <FieldGroup>
            <TextField
              label={t("settings.server.nutrition.key")}
              description={
                locked ? (
                  <LockedNote state={state} />
                ) : set ? (
                  t("settings.server.nutrition.keySet")
                ) : (
                  t("settings.server.nutrition.keyHint")
                )
              }
              type="password"
              autoComplete="off"
              spellCheck={false}
              disabled={locked}
              placeholder={set ? "••••••••••••" : undefined}
              value={key}
              onChange={(event) => setKey(event.target.value)}
            />
          </FieldGroup>
        </CardContent>
        <CardFooter className="mt-6 flex-wrap justify-end gap-2">
          {set && (
            <Button
              type="button"
              variant="outline"
              disabled={busy !== null}
              onClick={() => void test()}
            >
              {busy === "test" && <Spinner />}
              {t("settings.server.nutrition.test")}
            </Button>
          )}
          {set && !locked && (
            <Button
              type="button"
              variant="ghost"
              disabled={busy !== null}
              onClick={() => void saveKey(null)}
            >
              {busy === "remove" && <Spinner />}
              {t("settings.server.nutrition.remove")}
            </Button>
          )}
          {!locked && (
            <Button type="submit" disabled={busy !== null || !key.trim()}>
              {busy === "save" && <Spinner />}
              {set
                ? t("settings.server.nutrition.replace")
                : t("settings.server.nutrition.save")}
            </Button>
          )}
        </CardFooter>
      </form>
    </Card>
  )
}
