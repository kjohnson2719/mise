import * as React from "react"
import { useTranslation } from "react-i18next"

import { TextField } from "@/components/form/text-field"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useMe } from "@/features/auth/use-me"
import { api, ApiError, unwrap, type Schemas } from "@/lib/api/client"

import { ImportProgress } from "./import-progress"
import { asFileBody } from "./upload"

type Method = "file" | "mealie"

type FormProps = {
  /** How to import, when there's a choice: shown at the top. */
  chooser: React.ReactNode
  onStarted: (jobId: string) => void
}

/** Runs a call for a form: busy meanwhile, and what went wrong after. */
function useCall() {
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<ApiError | null>(null)
  async function call<T>(work: () => Promise<T>): Promise<T | null> {
    setBusy(true)
    setError(null)
    try {
      return await work()
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      setError(err)
      return null
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, call }
}

/**
 * Imports recipes from another app: a file, or (for the server admin) a
 * Mealie on the home network. Then follows the import as it runs.
 */
export function AppImportCard() {
  const { t } = useTranslation()
  const me = useMe()
  const [method, setMethod] = React.useState<Method>("file")
  const [jobId, setJobId] = React.useState<string | null>(null)
  // A fresh form after each import.
  const [round, setRound] = React.useState(0)

  const chooser = me.serverAdmin ? (
    <Field>
      <FieldLabel>{t("settings.transfer.apps.from")}</FieldLabel>
      <ToggleGroup
        variant="outline"
        value={[method]}
        onValueChange={(value) => {
          const next = value[0] as Method | undefined
          if (next) setMethod(next)
        }}
        aria-label={t("settings.transfer.apps.from")}
      >
        <ToggleGroupItem value="file">
          {t("settings.transfer.apps.aFile")}
        </ToggleGroupItem>
        <ToggleGroupItem value="mealie">
          {t("settings.transfer.apps.connect")}
        </ToggleGroupItem>
      </ToggleGroup>
    </Field>
  ) : null

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.transfer.apps.title")}</CardTitle>
        <CardDescription>
          {t("settings.transfer.apps.description")}
        </CardDescription>
      </CardHeader>
      {jobId ? (
        <ImportProgress
          jobId={jobId}
          onAgain={() => {
            setJobId(null)
            setRound((round) => round + 1)
          }}
        />
      ) : method === "mealie" && me.serverAdmin ? (
        <MealieImport key={round} chooser={chooser} onStarted={setJobId} />
      ) : (
        <FileImport key={round} chooser={chooser} onStarted={setJobId} />
      )}
    </Card>
  )
}

/** A file from another app: checked first, then imported. */
function FileImport({ chooser, onStarted }: FormProps) {
  const { t } = useTranslation()
  const [file, setFile] = React.useState<File | null>(null)
  const [checked, setChecked] = React.useState<Schemas["ImportFile"] | null>(
    null
  )
  const [group, setGroup] = React.useState<string | null>(null)
  const { busy, error, call } = useCall()

  async function check() {
    if (!file) return
    const found = await call(() =>
      unwrap(api.POST("/api/households/current/import/files", asFileBody(file)))
    )
    if (!found) return
    setChecked(found)
    // The group with the most recipes, which is likely the household's.
    const biggest = [...found.groups].sort((a, b) => b.recipes - a.recipes)[0]
    setGroup(biggest?.id ?? null)
  }

  async function start() {
    if (!checked) return
    const job = await call(() =>
      unwrap(
        api.POST("/api/households/current/import/files/{fileId}/start", {
          params: { path: { fileId: checked.id } },
          body: { group },
        })
      )
    )
    if (job) onStarted(job.id)
  }

  function another() {
    setChecked(null)
    setFile(null)
  }

  const nothingNew =
    checked !== null &&
    checked.groups.length === 0 &&
    checked.alreadyHere >= checked.recipes
  const groups = (checked?.groups ?? []).map((option) => ({
    value: option.id,
    label: t("settings.transfer.apps.groupOption", {
      name: option.name,
      count: option.recipes,
    }),
  }))

  return (
    <>
      <CardContent>
        <FieldGroup>
          {chooser}
          {checked ? (
            <>
              <p className="text-sm">
                {t(
                  checked.app === "paprika"
                    ? "settings.transfer.apps.paprika"
                    : checked.what === "backup"
                      ? "settings.transfer.apps.backup"
                      : "settings.transfer.apps.exported",
                  { count: checked.recipes }
                )}{" "}
                {nothingNew
                  ? t("settings.transfer.apps.allHere")
                  : checked.alreadyHere > 0 &&
                    t("settings.transfer.apps.alreadyHere", {
                      count: checked.alreadyHere,
                    })}
              </p>
              {groups.length > 1 && (
                <Field>
                  <FieldLabel htmlFor="import-group">
                    {t("settings.transfer.apps.group")}
                  </FieldLabel>
                  <Select
                    items={groups}
                    value={group}
                    onValueChange={(value) => setGroup(value)}
                  >
                    <SelectTrigger id="import-group">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {groups.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    {t("settings.transfer.apps.groupHint")}
                  </FieldDescription>
                </Field>
              )}
            </>
          ) : (
            <Field>
              <FieldLabel htmlFor="app-import-file">
                {t("settings.transfer.apps.file")}
              </FieldLabel>
              <Input
                id="app-import-file"
                type="file"
                accept=".zip,.paprikarecipes,.paprikarecipe,application/zip"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
              <FieldDescription>
                {t("settings.transfer.apps.fileHint")}
              </FieldDescription>
            </Field>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          )}
        </FieldGroup>
      </CardContent>
      <CardFooter className="gap-2">
        {checked ? (
          <>
            <Button disabled={busy || nothingNew} onClick={() => void start()}>
              {busy && <Spinner data-icon="inline-start" />}
              {t("settings.transfer.apps.start")}
            </Button>
            <Button variant="outline" disabled={busy} onClick={another}>
              {t("settings.transfer.apps.anotherFile")}
            </Button>
          </>
        ) : (
          <Button disabled={!file || busy} onClick={() => void check()}>
            {busy && <Spinner data-icon="inline-start" />}
            {busy
              ? t("settings.transfer.apps.uploading")
              : t("settings.transfer.apps.check")}
          </Button>
        )}
      </CardFooter>
    </>
  )
}

/** A Mealie on the home network: connected to first, then imported. */
function MealieImport({ chooser, onStarted }: FormProps) {
  const { t } = useTranslation()
  const [url, setUrl] = React.useState("")
  const [token, setToken] = React.useState("")
  const [found, setFound] = React.useState<Schemas["MealieCheck"] | null>(null)
  const { busy, error, call } = useCall()

  async function connect() {
    const result = await call(() =>
      unwrap(
        api.POST("/api/households/current/import/mealie/check", {
          body: { url, token },
        })
      )
    )
    if (result) setFound(result)
  }

  async function start() {
    const job = await call(() =>
      unwrap(
        api.POST("/api/households/current/import/mealie", {
          body: { url, token },
        })
      )
    )
    if (job) onStarted(job.id)
  }

  const fields = error?.fields ?? {}

  return (
    <form
      className="contents"
      onSubmit={(event) => {
        event.preventDefault()
        void (found ? start() : connect())
      }}
    >
      <CardContent>
        <FieldGroup>
          {chooser}
          {found ? (
            <p className="text-sm">
              {found.version
                ? t("settings.transfer.apps.found", {
                    version: found.version,
                    count: found.recipes,
                  })
                : t("settings.transfer.apps.foundUnknown", {
                    count: found.recipes,
                  })}
              {found.alreadyHere > 0 &&
                ` ${t("settings.transfer.apps.fromMealie", {
                  count: found.alreadyHere,
                })}`}
            </p>
          ) : (
            <>
              <TextField
                label={t("settings.transfer.apps.address")}
                description={t("settings.transfer.apps.addressHint")}
                type="url"
                inputMode="url"
                autoCapitalize="none"
                placeholder="http://192.168.1.20:9000"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                error={fields.url}
                required
              />
              <TextField
                label={t("settings.transfer.apps.token")}
                description={t("settings.transfer.apps.tokenHint")}
                type="password"
                autoComplete="off"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                error={fields.token}
                required
              />
            </>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          )}
        </FieldGroup>
      </CardContent>
      <CardFooter className="gap-2">
        <Button type="submit" disabled={busy}>
          {busy && <Spinner data-icon="inline-start" />}
          {found
            ? t("settings.transfer.apps.start")
            : busy
              ? t("settings.transfer.apps.connecting")
              : t("settings.transfer.apps.connectButton")}
        </Button>
        {found && (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => setFound(null)}
          >
            {t("settings.transfer.apps.change")}
          </Button>
        )}
      </CardFooter>
    </form>
  )
}
