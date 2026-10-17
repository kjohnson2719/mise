import { SparklesIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { CopyField } from "@/components/form/copy-field"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { Spinner } from "@/components/ui/spinner"
import { Markdown } from "@/features/assistant/markdown"
import { useMe } from "@/features/auth/use-me"
import { api, ApiError, unwrap, type Schemas } from "@/lib/api/client"
import { formatRelativeDate } from "@/lib/format"

import { ServerSwitch } from "./server-switch"

// The update check (docs/operations.md, "Releases and updates"): Merran's
// newest release, which the server looks for on GitHub every 6 hours. The
// server admin sees an Update badge in the sidebar and the account menu,
// and This server says what's new and how to update.

export type Updates = Schemas["Updates"]

export const updatesQuery = queryOptions({
  queryKey: ["settings", "server", "updates"],
  queryFn: () => unwrap(api.GET("/api/settings/server/updates")),
  // The server looks every 6 hours; an hour's wait here is plenty.
  staleTime: 60 * 60_000,
})

/** What the update check found, for the server admin only. */
export function useUpdates() {
  const me = useMe()
  const { data } = useQuery({ ...updatesQuery, enabled: me.serverAdmin })
  return me.serverAdmin ? data : undefined
}

/** In the sidebar, under the pages: there's a newer Merran. */
export function UpdateSidebarItem() {
  const { t } = useTranslation()
  const updates = useUpdates()
  if (!updates?.newer || !updates.latest) return null
  const label = t("updates.badge", { version: updates.latest.version })
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          tooltip={label}
          render={<Link to="/settings/server" />}
          className="text-primary"
        >
          <HugeiconsIcon icon={SparklesIcon} strokeWidth={2} />
          <span>{label}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

/** In the account menu, which phones have in place of the sidebar. */
export function UpdateMenuItem() {
  const { t } = useTranslation()
  const updates = useUpdates()
  if (!updates?.newer || !updates.latest) return null
  return (
    <DropdownMenuItem render={<Link to="/settings/server" />}>
      <HugeiconsIcon icon={SparklesIcon} strokeWidth={2} />
      {t("updates.badge", { version: updates.latest.version })}
    </DropdownMenuItem>
  )
}

/** The image to pull for a release: its own tag, which never moves. */
const IMAGE = "ghcr.io/merran-app/merran"

/**
 * This server's part of the About card: up to date, or what's new and how
 * to update, with Check now and the switch.
 */
export function UpdatesSection() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const { data: updates } = useQuery(updatesQuery)
  const [checking, setChecking] = React.useState(false)
  if (!updates) return null

  async function checkNow() {
    setChecking(true)
    try {
      const found = await unwrap(api.POST("/api/settings/server/updates/check"))
      queryClient.setQueryData(updatesQuery.queryKey, found)
      if (!found.newer && !found.error) toast.success(t("updates.upToDate"))
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    } finally {
      setChecking(false)
    }
  }

  const latest = updates.latest
  return (
    <div className="grid gap-4 border-t pt-4">
      {updates.devBuild ? (
        <p className="text-sm text-muted-foreground">{t("updates.devBuild")}</p>
      ) : updates.newer && latest ? (
        <div className="grid gap-3 rounded-2xl border border-primary/40 bg-primary/5 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">
              {t("updates.isOut", { version: latest.version })}
            </p>
            {latest.prerelease && (
              <Badge variant="outline">{t("updates.prerelease")}</Badge>
            )}
          </div>
          {latest.notes.trim() && (
            <div className="max-h-72 overflow-y-auto rounded-xl bg-background/60 p-3 text-sm">
              <Markdown>{latest.notes}</Markdown>
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            {updates.installMethod === "docker"
              ? t("updates.howDocker")
              : t("updates.howSource")}
          </p>
          {updates.installMethod === "docker" ? (
            <>
              <CopyField
                label={t("updates.compose")}
                value="docker compose pull && docker compose up -d"
                description={t("updates.composeHint")}
              />
              <CopyField
                label={t("updates.pinned")}
                value={`docker pull ${IMAGE}:${latest.version}`}
              />
            </>
          ) : (
            <CopyField
              label={t("updates.fromSource")}
              value={`git fetch --tags && git checkout v${latest.version} && pnpm install && pnpm build`}
            />
          )}
          <a
            href={latest.url}
            target="_blank"
            rel="noreferrer noopener"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {t("updates.onGithub")}
          </a>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {!updates.checking
            ? t("updates.off")
            : updates.checkedAt
              ? t("updates.checked", {
                  when: formatRelativeDate(updates.checkedAt, i18n.language),
                })
              : t("updates.notYet")}
        </p>
      )}
      {updates.error && (
        <p className="text-sm text-destructive">
          {t("updates.couldNot", { error: updates.error })}
        </p>
      )}
      {!updates.devBuild && (
        <>
          <ServerSwitch
            settingKey="updates.check"
            label={t("updates.switch")}
            description={t("updates.switchHint")}
          />
          {updates.checking && (
            <div>
              <Button
                variant="outline"
                size="sm"
                disabled={checking}
                onClick={() => void checkNow()}
              >
                {checking && <Spinner data-icon="inline-start" />}
                {t("updates.checkNow")}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
