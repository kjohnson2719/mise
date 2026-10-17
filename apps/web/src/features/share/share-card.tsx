import { useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { Trans, useTranslation } from "react-i18next"
import { toast } from "sonner"

import { CopyField } from "@/components/form/copy-field"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { apiKeysQuery } from "@/features/account/queries"
import { useActiveHousehold } from "@/features/auth/use-me"
import { api, ApiError, unwrap } from "@/lib/api/client"

/** Bold, for the names of buttons and actions in the steps. */
const BOLD = { b: <b className="font-medium text-foreground" /> }

/**
 * Sharing recipes to Merran from other apps: Android's share sheet once
 * Merran is installed, and on iPhone a Shortcut with a key that can only
 * add recipes.
 */
export function ShareCard() {
  const { t } = useTranslation()
  const household = useActiveHousehold()
  const queryClient = useQueryClient()
  const [key, setKey] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const secure = window.location.protocol === "https:"
  const address = `${window.location.origin}/api/share`

  async function makeKey() {
    setBusy(true)
    try {
      const made = await unwrap(
        api.POST("/api/auth/api-keys", {
          body: {
            name: t("settings.you.share.keyName"),
            permissions: { imports: "write" },
            expiresInDays: null,
          },
        })
      )
      await queryClient.invalidateQueries({ queryKey: apiKeysQuery.queryKey })
      setKey(made.key)
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.you.share.title")}</CardTitle>
        <CardDescription>{t("settings.you.share.description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <section className="grid gap-1.5">
          <h3 className="font-medium">{t("settings.you.share.android")}</h3>
          <p className="text-sm text-muted-foreground">
            <Trans
              i18nKey="settings.you.share.androidSteps"
              components={BOLD}
            />
          </p>
          {!secure && (
            <p className="text-sm text-muted-foreground">
              {t("settings.you.share.needsHttps")}
            </p>
          )}
        </section>

        <section className="grid gap-3">
          <div className="grid gap-1.5">
            <h3 className="font-medium">{t("settings.you.share.iphone")}</h3>
            <p className="text-sm text-muted-foreground">
              {t("settings.you.share.iphoneIntro")}
            </p>
          </div>
          {key ? (
            <>
              <ol className="grid list-decimal gap-3 ps-5 text-sm marker:text-muted-foreground">
                <li>
                  <Trans
                    i18nKey="settings.you.share.steps.create"
                    components={BOLD}
                  />
                </li>
                <li>
                  <Trans
                    i18nKey="settings.you.share.steps.shareSheet"
                    components={BOLD}
                  />
                </li>
                <li>
                  <div className="grid gap-2">
                    <span>
                      <Trans
                        i18nKey="settings.you.share.steps.fetch"
                        components={BOLD}
                      />
                    </span>
                    <CopyField
                      label={t("settings.you.share.address")}
                      value={address}
                    />
                  </div>
                </li>
                <li>
                  <div className="grid gap-2">
                    <span>
                      <Trans
                        i18nKey="settings.you.share.steps.method"
                        components={BOLD}
                      />
                    </span>
                    <CopyField
                      label={t("settings.you.share.authorization")}
                      value={`Bearer ${key}`}
                    />
                  </div>
                </li>
                <li>
                  <Trans
                    i18nKey="settings.you.share.steps.body"
                    components={BOLD}
                  />
                </li>
                <li>
                  <Trans
                    i18nKey="settings.you.share.steps.message"
                    components={BOLD}
                  />
                </li>
                <li>
                  <Trans
                    i18nKey="settings.you.share.steps.notify"
                    components={BOLD}
                  />
                </li>
              </ol>
              <p className="text-sm text-muted-foreground">
                <Trans i18nKey="settings.you.share.after" components={BOLD} />
              </p>
              <p className="text-sm text-muted-foreground">
                {t("settings.you.share.keyNote", {
                  household: household?.name,
                })}
              </p>
            </>
          ) : (
            <Button
              variant="outline"
              className="justify-self-start"
              disabled={busy}
              onClick={() => void makeKey()}
            >
              {busy && <Spinner data-icon="inline-start" />}
              {t("settings.you.share.makeKey")}
            </Button>
          )}
        </section>
      </CardContent>
    </Card>
  )
}
