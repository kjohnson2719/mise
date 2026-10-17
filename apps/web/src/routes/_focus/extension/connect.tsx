import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import * as React from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { meQuery } from "@/features/auth/queries"
import { api, ApiError, unwrap } from "@/lib/api/client"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/_focus/extension/connect")({
  component: ConnectExtension,
})

/** What the extension's key may do: add recipes, see the plan, keep the list. */
const PERMISSIONS = {
  household: "read",
  recipes: "write",
  imports: "write",
  plan: "read",
  list: "write",
} as const

/** How long to wait for the extension to say it's here. */
const WAIT_MS = 4000

type Step =
  "waiting" | "missing" | "asking" | "connecting" | "connected" | "failed"

/**
 * Where the browser extension connects: it opens this page, which asks
 * the person, makes a key with just what the extension needs, and hands
 * it over to the extension, which listens on this page. Nothing to copy.
 */
function ConnectExtension() {
  const { t } = useTranslation()
  const { data: me } = useQuery(meQuery)
  const [step, setStep] = React.useState<Step>("waiting")
  const [error, setError] = React.useState<string | null>(null)
  const households = me?.households ?? []
  // The one in use, unless they pick another.
  const [picked, setPicked] = React.useState<string | null>(null)
  const householdId = picked ?? me?.activeHouseholdId ?? null
  const household = households.find((one) => one.id === householdId)

  // The extension says it's here once it's listening on this page.
  React.useEffect(() => {
    const heard = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== location.origin) return
      const data = event.data as { source?: string; type?: string }
      if (data?.source !== "merran-extension") return
      if (data.type === "ready") {
        setStep((now) =>
          now === "waiting" || now === "missing" ? "asking" : now
        )
      }
      if (data.type === "key-received") setStep("connected")
    }
    window.addEventListener("message", heard)
    // Asked again until it answers: it starts listening once the page loads.
    const hello = () =>
      window.postMessage(
        { source: "merran", type: "extension-hello" },
        location.origin
      )
    hello()
    const asking = setInterval(hello, 500)
    const timer = setTimeout(() => {
      clearInterval(asking)
      setStep((now) => (now === "waiting" ? "missing" : now))
    }, WAIT_MS)
    return () => {
      window.removeEventListener("message", heard)
      clearInterval(asking)
      clearTimeout(timer)
    }
  }, [])

  async function connect() {
    setStep("connecting")
    setError(null)
    try {
      const made = await unwrap(
        api.POST("/api/auth/api-keys", {
          body: {
            name: t("extension.keyName"),
            permissions: PERMISSIONS,
            expiresInDays: null,
            ...(householdId ? { household: householdId } : {}),
          },
        })
      )
      window.postMessage(
        {
          source: "merran",
          type: "extension-key",
          key: made.key,
          keyId: made.id,
        },
        location.origin
      )
      // The extension says when it has it; if it doesn't, say so.
      setTimeout(
        () => setStep((now) => (now === "connecting" ? "failed" : now)),
        WAIT_MS
      )
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      setError(err.message)
      setStep("asking")
    }
  }

  return (
    <main className="mx-auto grid min-h-dvh max-w-md content-center gap-6 px-4 py-10">
      <div className="flex items-center gap-3">
        <img src="/favicon.svg" alt="" className="size-10" />
        <h1 className="font-heading text-2xl font-semibold">
          {t("extension.title")}
        </h1>
      </div>

      {step === "waiting" ? (
        <p className="flex items-center gap-2 text-muted-foreground">
          <Spinner />
          {t("extension.waiting")}
        </p>
      ) : step === "missing" ? (
        <div className="grid gap-3">
          <p>{t("extension.missing")}</p>
          <p className="text-muted-foreground">{t("extension.missingHint")}</p>
          <Button variant="outline" render={<Link to="/" />}>
            {t("extension.toMerran")}
          </Button>
        </div>
      ) : step === "connected" ? (
        <div className="grid gap-3" role="status">
          <p className="font-medium">{t("extension.connected")}</p>
          <p className="text-muted-foreground">
            {t("extension.connectedHint")}
          </p>
        </div>
      ) : step === "failed" ? (
        <div className="grid gap-3" role="status">
          <p>{t("extension.failed")}</p>
          <Button variant="outline" render={<Link to="/settings/you" />}>
            {t("extension.toKeys")}
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          {households.length > 1 ? (
            <div className="grid gap-2">
              <p className="text-lg" id="which-household">
                {t("extension.which")}
              </p>
              <div
                className="grid gap-2"
                role="radiogroup"
                aria-labelledby="which-household"
              >
                {households.map((one) => (
                  <button
                    key={one.id}
                    type="button"
                    role="radio"
                    aria-checked={one.id === householdId}
                    onClick={() => setPicked(one.id)}
                    className={cn(
                      "rounded-2xl border px-4 py-3 text-left font-medium transition-colors outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50",
                      one.id === householdId && "border-primary bg-primary/5"
                    )}
                  >
                    {one.name}
                  </button>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">
                {t("extension.whichHint")}
              </p>
            </div>
          ) : (
            <p className="text-lg">
              {t("extension.ask", { household: household?.name ?? "" })}
            </p>
          )}
          <ul className="grid list-disc gap-1 pl-5 text-muted-foreground">
            <li>{t("extension.can.recipes")}</li>
            <li>{t("extension.can.plan")}</li>
            <li>{t("extension.can.list")}</li>
          </ul>
          <p className="text-sm text-muted-foreground">
            {t("extension.revoke")}
          </p>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={step === "connecting"}
              onClick={() => void connect()}
            >
              {step === "connecting" && <Spinner data-icon="inline-start" />}
              {t("extension.connect")}
            </Button>
            <Button variant="outline" render={<Link to="/" />}>
              {t("extension.cancel")}
            </Button>
          </div>
        </div>
      )}
    </main>
  )
}
