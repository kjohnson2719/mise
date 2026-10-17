import {
  ArrowDown01Icon,
  Download04Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import * as React from "react"
import { useTranslation } from "react-i18next"

import { CopyField } from "@/components/form/copy-field"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

import type { Extension } from "./bridge"

/** Where the extension's zips are, until it's in the browsers' stores. */
const RELEASES = "https://github.com/merran-app/merran/releases/latest"

/**
 * Setting up Merran's browser extension for something it does here: get
 * it, connect it to this Merran and household, and anything else it needs
 * (`also`). Each step ticks itself off as the extension says it's done.
 */
export function ExtensionSetup({
  extension,
  householdId,
  household,
  description,
  also,
}: {
  extension: Extension
  householdId: string
  household: string
  description: string
  /** A last step, such as letting it work on walmart.com. */
  also?: { title: string; text: string; done: boolean; action: React.ReactNode }
}) {
  const { t } = useTranslation()
  const status = extension.state === "here" ? extension.status : null
  const installed = status !== null
  const connected =
    status?.households.some((one) => one.id === householdId) ?? false
  const steps = [installed, connected, also?.done ?? true]
  // The first not done yet is the one to do now.
  const now = steps.indexOf(false)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("extension.setup.title")}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-5">
          <Step
            number={1}
            done={installed}
            current={now === 0}
            title={t("extension.setup.get.title")}
          >
            {!installed && (
              <>
                <p>{t("extension.setup.get.text")}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant={now === 0 ? "default" : "outline"}
                    render={
                      <a href={RELEASES} target="_blank" rel="noreferrer" />
                    }
                  >
                    <HugeiconsIcon
                      icon={Download04Icon}
                      strokeWidth={2}
                      data-icon="inline-start"
                    />
                    {t("extension.setup.get.button")}
                  </Button>
                </div>
                <Collapsible>
                  <CollapsibleTrigger className="group flex items-center gap-1 text-sm font-medium underline-offset-3 hover:underline">
                    {t("extension.setup.get.how")}
                    <HugeiconsIcon
                      icon={ArrowDown01Icon}
                      strokeWidth={2}
                      className="size-4 transition-transform group-data-[panel-open]:rotate-180"
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <ul className="mt-2 grid list-disc gap-2 pl-5 text-sm">
                      <li>{t("extension.setup.get.chrome")}</li>
                      <li>{t("extension.setup.get.firefox")}</li>
                    </ul>
                  </CollapsibleContent>
                </Collapsible>
              </>
            )}
          </Step>

          <Step
            number={2}
            done={connected}
            current={now === 1}
            title={t("extension.setup.connect.title")}
          >
            {!connected && (
              <>
                <p>{t("extension.setup.connect.text")}</p>
                <CopyField
                  label={t("extension.setup.connect.address")}
                  value={location.origin}
                />
                {status && status.households.length > 0 && (
                  <p>
                    {t("extension.setup.connect.other", {
                      households: status.households
                        .map((one) => one.name)
                        .join(", "),
                      household,
                    })}
                  </p>
                )}
              </>
            )}
          </Step>

          {also && (
            <Step
              number={3}
              done={also.done}
              current={now === 2}
              title={also.title}
            >
              {!also.done && (
                <>
                  <p>{also.text}</p>
                  {now === 2 && <div>{also.action}</div>}
                </>
              )}
            </Step>
          )}
        </ol>
        {!installed && (
          <p
            className="mt-5 flex items-center gap-2 text-sm text-muted-foreground"
            role="status"
          >
            <Spinner />
            {t("extension.setup.looking")}
          </p>
        )}
        {extension.state === "missing" && (
          <Collapsible className="mt-2">
            <CollapsibleTrigger className="group flex items-center gap-1 text-sm font-medium underline-offset-3 hover:underline">
              {t("extension.setup.stuck.title")}
              <HugeiconsIcon
                icon={ArrowDown01Icon}
                strokeWidth={2}
                className="size-4 transition-transform group-data-[panel-open]:rotate-180"
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul className="mt-2 grid list-disc gap-2 pl-5 text-sm text-muted-foreground">
                <li>{t("extension.setup.stuck.browser")}</li>
                <li>{t("extension.setup.stuck.reload")}</li>
                <li>
                  {t("extension.setup.stuck.address", {
                    address: location.host,
                  })}
                </li>
                <li>{t("extension.setup.stuck.on")}</li>
              </ul>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  )
}

function Step({
  number,
  done,
  current,
  title,
  children,
}: {
  number: number
  done: boolean
  current: boolean
  title: string
  children?: React.ReactNode
}) {
  const { t } = useTranslation()
  return (
    <li className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2">
      <span
        className={cn(
          "flex size-7 items-center justify-center rounded-full border text-sm font-semibold tabular-nums",
          done && "border-primary bg-primary text-primary-foreground",
          current && !done && "border-primary text-primary"
        )}
        aria-hidden
      >
        {done ? (
          <HugeiconsIcon
            icon={Tick02Icon}
            strokeWidth={2.5}
            className="size-4"
          />
        ) : (
          number
        )}
      </span>
      <p
        className={cn(
          "self-center font-medium",
          !done && !current && "text-muted-foreground"
        )}
      >
        {title}
        {done && <span className="sr-only"> {t("extension.setup.done")}</span>}
      </p>
      {children && (
        <div
          className={cn(
            "col-start-2 grid gap-3 text-sm",
            !current && "text-muted-foreground"
          )}
        >
          {children}
        </div>
      )}
    </li>
  )
}
