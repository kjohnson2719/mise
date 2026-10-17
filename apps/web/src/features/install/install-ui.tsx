import {
  AddSquareIcon,
  Cancel01Icon,
  Download04Icon,
  MoreVerticalIcon,
  SmartPhone01Icon,
  SquareArrowUp02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import * as React from "react"
import { Trans, useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"

import {
  onTouchDevice,
  openInstallGuide,
  useInstall,
  type InstallWay,
} from "./install"

/** Bold, for the names of buttons in the steps. */
const BOLD = { b: <b className="font-medium text-foreground" /> }

/** This device said not now to the card on Today, for good. */
const DISMISSED = "merran.install.dismissed"

/** Installs, or shows how, saying so when the browser's prompt installs it. */
function useStartInstall() {
  const { t } = useTranslation()
  const install = useInstall()
  return async () => {
    if ((await install.install()) === "accepted")
      toast.success(t("install.done"))
  }
}

/** The steps for a browser with no install prompt. */
function Steps({ way }: { way: InstallWay }) {
  const steps: { icon: typeof AddSquareIcon; text: string }[] =
    way === "ios"
      ? [
          { icon: SquareArrowUp02Icon, text: "install.guide.ios.share" },
          { icon: AddSquareIcon, text: "install.guide.ios.add" },
          { icon: SmartPhone01Icon, text: "install.guide.ios.done" },
        ]
      : way === "mac"
        ? [{ icon: Download04Icon, text: "install.guide.mac" }]
        : [
            { icon: MoreVerticalIcon, text: "install.guide.menu.open" },
            { icon: Download04Icon, text: "install.guide.menu.choose" },
          ]
  return (
    <ol className="grid gap-3">
      {steps.map((step, index) => (
        <li key={step.text} className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <HugeiconsIcon icon={step.icon} strokeWidth={2} />
          </span>
          <span className="pt-1.5 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{index + 1}.</span>{" "}
            <Trans i18nKey={step.text as never} components={BOLD} />
          </span>
        </li>
      ))}
    </ol>
  )
}

/**
 * The steps to install, for browsers with no install prompt: Share, then
 * Add to Home Screen on an iPhone or iPad; File, then Add to Dock in
 * Safari on a Mac; the browser's menu anywhere else. Mounted once, opened
 * from anywhere.
 */
export function InstallGuide() {
  const { t } = useTranslation()
  const { way, guideOpen } = useInstall()
  return (
    <Dialog
      open={guideOpen && way !== "installed"}
      onOpenChange={(open) => openInstallGuide(open)}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("install.guide.title")}</DialogTitle>
          <DialogDescription>{t("install.hint")}</DialogDescription>
        </DialogHeader>
        <Steps way={way} />
        {way === "menu" && (
          <p className="text-sm text-muted-foreground">
            {t("install.guide.menu.none")}
          </p>
        )}
        {!window.isSecureContext && (
          <p className="rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground">
            {t("install.guide.insecure")}
          </p>
        )}
        <DialogFooter>
          <Button onClick={() => openInstallGuide(false)}>
            {t("install.guide.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Install Merran, in the account menu, until it's installed. */
export function InstallMenuItem() {
  const { t } = useTranslation()
  const { way } = useInstall()
  const start = useStartInstall()
  if (way === "installed") return null
  return (
    <DropdownMenuItem onClick={() => void start()}>
      <HugeiconsIcon icon={Download04Icon} strokeWidth={2} />
      {t("install.button")}
    </DropdownMenuItem>
  )
}

/** Settings → You: Merran on this device, installed or how to. */
export function InstallCard() {
  const { t } = useTranslation()
  const { way } = useInstall()
  const start = useStartInstall()
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("install.card.title")}</CardTitle>
        <CardDescription>
          {way === "installed" ? t("install.installed") : t("install.hint")}
        </CardDescription>
      </CardHeader>
      {way !== "installed" && (
        <CardContent>
          <Button onClick={() => void start()}>
            <HugeiconsIcon
              icon={Download04Icon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            {t("install.button")}
          </Button>
        </CardContent>
      )}
    </Card>
  )
}

function dismissed() {
  try {
    return localStorage.getItem(DISMISSED) === "1"
  } catch {
    return false
  }
}

/**
 * On Today, on a phone or tablet that hasn't installed Merran: put it on
 * the home screen. Not now hides it on this device for good; it's still
 * in the account menu and Settings.
 */
export function InstallBanner() {
  const { t } = useTranslation()
  const { way } = useInstall()
  const start = useStartInstall()
  const [hidden, setHidden] = React.useState(dismissed)
  if (way === "installed" || hidden || !onTouchDevice()) return null

  function notNow() {
    try {
      localStorage.setItem(DISMISSED, "1")
    } catch {
      // Not remembered: it shows again next time.
    }
    setHidden(true)
  }

  return (
    <section
      aria-labelledby="install-title"
      className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-3xl border bg-card p-5 text-card-foreground"
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
        <HugeiconsIcon icon={SmartPhone01Icon} strokeWidth={2} />
      </span>
      <div className="grid min-w-48 flex-1 gap-0.5">
        <h2 id="install-title" className="font-medium">
          {t("install.title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("install.hint")}</p>
      </div>
      <div className="flex gap-2">
        <Button onClick={() => void start()}>{t("install.button")}</Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("install.notNow")}
          onClick={notNow}
        >
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
        </Button>
      </div>
    </section>
  )
}
