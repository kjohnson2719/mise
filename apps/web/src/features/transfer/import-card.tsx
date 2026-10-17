import * as React from "react"
import { useTranslation } from "react-i18next"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useMe, useRefreshAll } from "@/features/auth/use-me"
import { api, ApiError, unwrap } from "@/lib/api/client"

import { ImportProgress } from "./import-progress"
import { asFileBody } from "./upload"

type Target = "this" | "new"

/**
 * Imports a Merran export, into this household or (for the server admin) as
 * a new one, then follows the import as it runs.
 */
export function ImportCard() {
  const { t } = useTranslation()
  const me = useMe()
  const refreshAll = useRefreshAll()
  const [file, setFile] = React.useState<File | null>(null)
  const [target, setTarget] = React.useState<Target>("this")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [jobId, setJobId] = React.useState<string | null>(null)
  const picker = React.useRef<HTMLInputElement>(null)

  async function start() {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      if (target === "new") {
        const made = await unwrap(
          api.POST("/api/households/import", asFileBody(file))
        )
        setJobId(made.job.id)
        // The new household is the one in use now: everything follows it.
        await refreshAll()
      } else {
        const job = await unwrap(
          api.POST("/api/households/current/import", asFileBody(file))
        )
        setJobId(job.id)
      }
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  function again() {
    setJobId(null)
    setFile(null)
    if (picker.current) picker.current.value = ""
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.transfer.import.title")}</CardTitle>
        <CardDescription>
          {t("settings.transfer.import.description")}
        </CardDescription>
      </CardHeader>
      {jobId ? (
        <ImportProgress jobId={jobId} onAgain={again} />
      ) : (
        <>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="import-file">
                  {t("settings.transfer.import.file")}
                </FieldLabel>
                <Input
                  ref={picker}
                  id="import-file"
                  type="file"
                  accept=".zip,application/zip"
                  onChange={(event) => {
                    setFile(event.target.files?.[0] ?? null)
                    setError(null)
                  }}
                />
              </Field>
              {me.serverAdmin && (
                <Field>
                  <FieldLabel>{t("settings.transfer.import.into")}</FieldLabel>
                  <ToggleGroup
                    variant="outline"
                    value={[target]}
                    onValueChange={(value) => {
                      const next = value[0] as Target | undefined
                      if (next) setTarget(next)
                    }}
                    aria-label={t("settings.transfer.import.into")}
                  >
                    <ToggleGroupItem value="this">
                      {t("settings.transfer.import.thisHousehold")}
                    </ToggleGroupItem>
                    <ToggleGroupItem value="new">
                      {t("settings.transfer.import.newHousehold")}
                    </ToggleGroupItem>
                  </ToggleGroup>
                  {target === "new" && (
                    <FieldDescription>
                      {t("settings.transfer.import.newHint")}
                    </FieldDescription>
                  )}
                </Field>
              )}
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </FieldGroup>
          </CardContent>
          <CardFooter>
            <Button disabled={!file || busy} onClick={() => void start()}>
              {busy && <Spinner data-icon="inline-start" />}
              {busy
                ? t("settings.transfer.import.uploading")
                : t("settings.transfer.import.start")}
            </Button>
          </CardFooter>
        </>
      )}
    </Card>
  )
}
