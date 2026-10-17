import { ArrowLeft01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CollectionsTab } from "@/features/find/collections-tab"
import { DiscoverTab } from "@/features/find/discover-tab"
import { SitesTab } from "@/features/find/sites-tab"

const TABS = ["collections", "sites", "discover"] as const
type Tab = (typeof TABS)[number]

type FindSearch = { tab?: Tab; site?: string }

export const Route = createFileRoute("/_app/recipes/find/")({
  validateSearch: (search: Record<string, unknown>): FindSearch => ({
    ...(TABS.includes(search.tab as Tab) ? { tab: search.tab as Tab } : {}),
    ...(typeof search.site === "string" && /^[\w-]+$/.test(search.site)
      ? { site: search.site }
      : {}),
  }),
  component: FindRecipes,
})

/**
 * New recipes to add: starter collections, the newest from followed
 * sites, and Discover with AI.
 */
function FindRecipes() {
  const { t } = useTranslation()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const tab = search.tab ?? "collections"

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="mt-2 -ml-3 md:mt-4"
        render={<Link to="/recipes" />}
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
        {t("nav.recipes")}
      </Button>
      <PageHeader title={t("find.title")} />
      <Tabs
        value={tab}
        onValueChange={(value) =>
          void navigate({ search: { tab: value as Tab }, replace: true })
        }
        className="gap-6"
      >
        <TabsList>
          <TabsTrigger value="collections">
            {t("find.tabs.collections")}
          </TabsTrigger>
          <TabsTrigger value="sites">{t("find.tabs.sites")}</TabsTrigger>
          <TabsTrigger value="discover">{t("find.tabs.discover")}</TabsTrigger>
        </TabsList>
        <TabsContent value="collections">
          <CollectionsTab />
        </TabsContent>
        <TabsContent value="sites">
          <SitesTab
            site={search.site}
            onSite={(site) =>
              void navigate({
                search: { tab: "sites", ...(site ? { site } : {}) },
                replace: true,
              })
            }
          />
        </TabsContent>
        <TabsContent value="discover">
          <DiscoverTab />
        </TabsContent>
      </Tabs>
    </>
  )
}
