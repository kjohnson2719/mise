import { Tick02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { storesFor } from "@merran/shared"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { householdQuery } from "@/features/household/queries"
import { api, ApiError, unwrap } from "@/lib/api/client"

import { yourStoresQuery } from "./queries"

/**
 * The stores the household shops at, picked once, for Find on the list:
 * its Kroger store and Walmart come with being set up, and the rest are
 * picked from the stores for its country. However many stores Merran
 * knows, Find only offers these.
 */
export function YourStoresCard() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data: household } = useQuery(householdQuery)
  const { data: yours } = useQuery(yourStoresQuery)
  const [saving, setSaving] = React.useState(false)
  if (!yours) return null
  const connected = yours.filter((store) => store.connected)
  const picked = yours
    .filter((store) => !store.connected)
    .map((store) => store.key)
  const offered = storesFor(household?.country).filter(
    (store) => !connected.some((one) => one.key === store.key)
  )

  async function save(next: string[]) {
    setSaving(true)
    try {
      await unwrap(
        api.PATCH("/api/settings/household", {
          body: { "stores.yours": next },
        })
      )
      await queryClient.invalidateQueries({
        queryKey: yourStoresQuery.queryKey,
      })
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {t("settings.household.yourStores.title")}
          {saving && <Spinner />}
        </CardTitle>
        <CardDescription>
          {t("settings.household.yourStores.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {connected.length > 0 && (
          <div className="grid gap-2">
            <p className="text-sm text-muted-foreground">
              {t("settings.household.yourStores.connected")}
            </p>
            <div className="flex flex-wrap gap-2">
              {connected.map((store) => (
                <Badge key={store.key}>
                  <HugeiconsIcon
                    icon={Tick02Icon}
                    strokeWidth={2.5}
                    data-icon="inline-start"
                  />
                  {store.name}
                </Badge>
              ))}
            </div>
          </div>
        )}
        <div className="grid gap-2">
          <p className="text-sm text-muted-foreground">
            {t("settings.household.yourStores.others")}
          </p>
          <ToggleGroup
            multiple
            variant="outline"
            size="sm"
            value={picked}
            onValueChange={(next) => void save(next as string[])}
            disabled={saving}
            className="flex-wrap justify-start"
          >
            {offered.map((store) => (
              <ToggleGroupItem key={store.key} value={store.key}>
                {store.name}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </CardContent>
    </Card>
  )
}
