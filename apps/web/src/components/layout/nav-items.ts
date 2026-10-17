import {
  Calendar03Icon,
  CookBookIcon,
  FridgeIcon,
  Home01Icon,
  ShoppingBasket01Icon,
} from "@hugeicons/core-free-icons"

/** The main sections: the sidebar on iPad and desktop, the bottom tabs on phones. */
export const PRIMARY_NAV = [
  { to: "/", labelKey: "nav.today", icon: Home01Icon },
  { to: "/recipes", labelKey: "nav.recipes", icon: CookBookIcon },
  { to: "/plan", labelKey: "nav.plan", icon: Calendar03Icon },
  { to: "/list", labelKey: "nav.list", icon: ShoppingBasket01Icon },
  { to: "/pantry", labelKey: "nav.pantry", icon: FridgeIcon },
] as const

/** Whether a section is the one open; "/" only on the home page itself. */
export function isSectionActive(to: string, pathname: string) {
  return to === "/" ? pathname === "/" : pathname.startsWith(to)
}
