import { HugeiconsIcon } from "@hugeicons/react"
import { Link, useRouterState } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"

import { isSectionActive, PRIMARY_NAV } from "./nav-items"

/** The phone's tab bar. iPad and desktop use the sidebar instead. */
export function BottomNav() {
  const { t } = useTranslation()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  return (
    <nav
      aria-label={t("nav.main")}
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="grid grid-cols-5">
        {PRIMARY_NAV.map((item) => {
          const active = isSectionActive(item.to, pathname)
          return (
            <li key={item.to}>
              <Link
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 pt-2 pb-2.5 text-xs font-medium text-muted-foreground transition-colors",
                  active && "text-foreground"
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-12 items-center justify-center rounded-full transition-colors min-[400px]:w-14",
                    active && "bg-accent text-accent-foreground"
                  )}
                >
                  <HugeiconsIcon
                    icon={item.icon}
                    strokeWidth={active ? 2.2 : 1.8}
                    className="size-5"
                  />
                </span>
                {t(item.labelKey)}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
