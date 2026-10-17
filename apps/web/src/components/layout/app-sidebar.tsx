import { HugeiconsIcon } from "@hugeicons/react"
import { Link, useRouterState } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import { Logo } from "@/components/brand/logo"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

import { UpdateSidebarItem } from "@/features/server/updates"

import { isSectionActive, PRIMARY_NAV } from "./nav-items"
import { SidebarUserMenu } from "./user-menu"

export function AppSidebar() {
  const { t } = useTranslation()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        {/* Same height as a large menu button, so the nav below stays put; the
            padding centers the mark over the nav icons. */}
        <div className="flex h-14 items-center px-1.5 group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <Logo className="[&_svg]:size-7 group-data-[collapsible=icon]:[&_svg]:size-6 group-data-[collapsible=icon]:[&>span]:hidden" />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {PRIMARY_NAV.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    isActive={isSectionActive(item.to, pathname)}
                    tooltip={t(item.labelKey)}
                    render={<Link to={item.to} />}
                  >
                    <HugeiconsIcon icon={item.icon} strokeWidth={2} />
                    <span>{t(item.labelKey)}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <UpdateSidebarItem />
        <SidebarUserMenu />
      </SidebarFooter>
    </Sidebar>
  )
}
