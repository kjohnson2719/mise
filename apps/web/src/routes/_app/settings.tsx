import { createFileRoute, Link, Outlet } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import { PageHeader } from "@/components/layout/page-header"
import { useActiveHousehold, useMe } from "@/features/auth/use-me"
import { isAdminRole } from "@/features/household/queries"

export const Route = createFileRoute("/_app/settings")({
  component: SettingsLayout,
})

/** Each tab, and who sees it: everyone, household admins, or the server admin. */
const SECTIONS = [
  { to: "/settings/you", labelKey: "settings.you.tab", only: null },
  {
    to: "/settings/household",
    labelKey: "settings.household.tab",
    only: null,
  },
  {
    to: "/settings/import-export",
    labelKey: "settings.transfer.tab",
    only: "householdAdmin",
  },
  {
    to: "/settings/server",
    labelKey: "settings.server.tab",
    only: "serverAdmin",
  },
] as const

function SettingsLayout() {
  const { t } = useTranslation()
  const me = useMe()
  const household = useActiveHousehold()
  const sections = SECTIONS.filter(
    (section) =>
      section.only === null ||
      (section.only === "serverAdmin" && me.serverAdmin) ||
      (section.only === "householdAdmin" && isAdminRole(household?.role))
  )
  return (
    <>
      <PageHeader title={t("nav.settings")} />
      <nav
        aria-label={t("settings.sections")}
        className="mb-6 flex w-fit gap-1 rounded-4xl bg-muted p-1"
      >
        {sections.map((section) => (
          <Link
            key={section.to}
            to={section.to}
            className="rounded-4xl px-4 py-1.5 text-sm font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
            activeProps={{
              className: "bg-background text-foreground shadow-sm",
            }}
          >
            {t(section.labelKey)}
          </Link>
        ))}
      </nav>
      <div className="flex flex-col gap-6">
        <Outlet />
      </div>
    </>
  )
}
