import { useSuspenseQuery } from "@tanstack/react-query"
import * as React from "react"
import { Trans, useTranslation } from "react-i18next"
import { toast } from "sonner"

import { CopyField } from "@/components/form/copy-field"
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

const ID = "stores.krogerClientId"
const SECRET = "stores.krogerClientSecret"

/**
 * The server's Kroger developer app: households then find their Kroger
 * store (Fry's, Ralphs...), see its prices and send the list to its cart.
 */
export function KrogerCard() {
  const { t } = useTranslation()
  const { data } = useSuspenseQuery(serverSettingsQuery)
  const save = useSaveServerSettings()
  const idState = data.settings.find((s) => s.key === ID)
  const secretState = data.settings.find((s) => s.key === SECRET)
  const savedId = typeof idState?.value === "string" ? idState.value : ""
  const [clientId, setClientId] = React.useState(savedId)
  const [secret, setSecret] = React.useState("")
  const [busy, setBusy] = React.useState<"save" | "test" | "remove" | null>(
    null
  )
  if (!idState || !secretState) return null
  const set = idState.source !== "default" && secretState.source !== "default"
  const locked = idState.lockedBy !== null || secretState.lockedBy !== null
  const redirectUri =
    data.kroger.redirectUri ??
    `${window.location.origin}/api/stores/kroger/callback`
  const changed = clientId.trim() !== savedId || secret.trim() !== ""

  async function test(given: { clientId?: string; clientSecret?: string }) {
    setBusy("test")
    try {
      await unwrap(
        api.POST("/api/settings/server/kroger/test", { body: given })
      )
      toast.success(t("settings.server.kroger.works"))
      return true
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
      return false
    } finally {
      setBusy(null)
    }
  }

  async function saveApp() {
    const given = {
      clientId: clientId.trim() || undefined,
      clientSecret: secret.trim() || undefined,
    }
    if (!(await test(given))) return
    setBusy("save")
    try {
      await save({
        ...(given.clientId !== savedId && { [ID]: given.clientId }),
        ...(given.clientSecret && { [SECRET]: given.clientSecret }),
      })
      setSecret("")
      toast.success(t("settings.server.kroger.saved"))
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    } finally {
      setBusy(null)
    }
  }

  async function remove() {
    setBusy("remove")
    try {
      await save({ [ID]: null, [SECRET]: null })
      setClientId("")
      setSecret("")
      toast.success(t("settings.server.kroger.removed"))
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
        <CardTitle>{t("settings.server.kroger.title")}</CardTitle>
        <CardDescription>
          <Trans
            i18nKey="settings.server.kroger.description"
            components={{
              link: (
                <a
                  href="https://developer.kroger.com/"
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
          if (changed && clientId.trim()) void saveApp()
        }}
      >
        <CardContent>
          <FieldGroup>
            <CopyField
              label={t("settings.server.kroger.redirect")}
              value={redirectUri}
              description={
                data.kroger.redirectUri
                  ? t("settings.server.kroger.redirectHint")
                  : t("settings.server.kroger.redirectHere")
              }
            />
            <TextField
              label={t("settings.server.kroger.clientId")}
              description={
                idState.lockedBy !== null ? (
                  <LockedNote state={idState} />
                ) : undefined
              }
              autoComplete="off"
              spellCheck={false}
              disabled={idState.lockedBy !== null}
              value={clientId}
              onChange={(event) => setClientId(event.target.value)}
            />
            <TextField
              label={t("settings.server.kroger.secret")}
              description={
                secretState.lockedBy !== null ? (
                  <LockedNote state={secretState} />
                ) : secretState.source !== "default" ? (
                  t("settings.server.kroger.secretSet")
                ) : (
                  t("settings.server.kroger.secretHint")
                )
              }
              type="password"
              autoComplete="off"
              spellCheck={false}
              disabled={secretState.lockedBy !== null}
              placeholder={
                secretState.source !== "default" ? "••••••••••••" : undefined
              }
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
            />
          </FieldGroup>
        </CardContent>
        <CardFooter className="mt-6 flex-wrap justify-end gap-2">
          {set && (
            <Button
              type="button"
              variant="outline"
              disabled={busy !== null}
              onClick={() => void test({})}
            >
              {busy === "test" && <Spinner />}
              {t("settings.server.kroger.test")}
            </Button>
          )}
          {set && !locked && (
            <Button
              type="button"
              variant="ghost"
              disabled={busy !== null}
              onClick={() => void remove()}
            >
              {busy === "remove" && <Spinner />}
              {t("settings.server.kroger.remove")}
            </Button>
          )}
          {!locked && (
            <Button
              type="submit"
              disabled={
                busy !== null ||
                !changed ||
                !clientId.trim() ||
                (secretState.source === "default" && !secret.trim())
              }
            >
              {busy === "save" && <Spinner />}
              {t("settings.server.kroger.save")}
            </Button>
          )}
        </CardFooter>
      </form>
    </Card>
  )
}
