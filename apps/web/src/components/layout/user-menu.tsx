import {
  Home09Icon,
  Logout03Icon,
  Settings01Icon,
  UnfoldMoreIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Link } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { ModeSubmenu } from "@/components/theme/mode-toggle"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  useActiveHousehold,
  useMe,
  useSignOut,
  useSwitchHousehold,
} from "@/features/auth/use-me"
import { InstallMenuItem } from "@/features/install/install-ui"
import { UpdateMenuItem } from "@/features/server/updates"
import { initials } from "@/lib/initials"

function UserAvatar() {
  const me = useMe()
  return (
    <Avatar>
      <AvatarFallback className="bg-accent text-accent-foreground">
        {initials(me.name)}
      </AvatarFallback>
    </Avatar>
  )
}

/** The account menu's contents: households, appearance, settings, sign out. */
function UserMenuItems() {
  const { t } = useTranslation()
  const me = useMe()
  const signOut = useSignOut()
  const switchHousehold = useSwitchHousehold()

  return (
    <>
      <DropdownMenuGroup>
        <DropdownMenuLabel className="grid gap-0.5">
          <span className="font-medium text-foreground">{me.name}</span>
          <span className="text-xs font-normal">{me.username ?? me.email}</span>
        </DropdownMenuLabel>
      </DropdownMenuGroup>

      {me.households.length > 1 && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>{t("account.households")}</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={me.activeHouseholdId ?? undefined}
              onValueChange={(id) =>
                switchHousehold(id as string).catch(() =>
                  toast.error(t("account.switchFailed"))
                )
              }
            >
              {me.households.map((household) => (
                <DropdownMenuRadioItem
                  key={household.id}
                  value={household.id}
                  closeOnClick
                >
                  <HugeiconsIcon icon={Home09Icon} strokeWidth={2} />
                  {household.name}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
        </>
      )}

      <DropdownMenuSeparator />
      <ModeSubmenu />
      <InstallMenuItem />
      <UpdateMenuItem />
      <DropdownMenuItem render={<Link to="/settings" />}>
        <HugeiconsIcon icon={Settings01Icon} strokeWidth={2} />
        {t("nav.settings")}
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={() =>
          signOut().catch(() => toast.error(t("account.signOutFailed")))
        }
      >
        <HugeiconsIcon icon={Logout03Icon} strokeWidth={2} />
        {t("account.signOut")}
      </DropdownMenuItem>
    </>
  )
}

/** The avatar button in the phone's top bar, where there's no sidebar. */
export function UserMenu() {
  const { t } = useTranslation()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full"
            aria-label={t("account.menu")}
          />
        }
      >
        <UserAvatar />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <UserMenuItems />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The person and household at the foot of the sidebar, opening the account menu. */
export function SidebarUserMenu() {
  const { t } = useTranslation()
  const me = useMe()
  const household = useActiveHousehold()
  const { isMobile } = useSidebar()

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                aria-label={t("account.menu")}
                className="data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground"
              />
            }
          >
            <UserAvatar />
            <span className="grid min-w-0 flex-1 leading-tight">
              <span className="truncate font-medium">{me.name}</span>
              {household && (
                <span className="truncate text-xs text-muted-foreground">
                  {household.name}
                </span>
              )}
            </span>
            <HugeiconsIcon
              icon={UnfoldMoreIcon}
              strokeWidth={2}
              className="ml-auto"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={8}
            className="w-60"
          >
            <UserMenuItems />
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
