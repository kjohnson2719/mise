import { BookOpen01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { useCapability } from "@/features/capabilities/queries"

import { collectionsQuery, type CollectionSummary } from "./queries"

/**
 * Starter collections: sets of recipes to start a library with, filling
 * themselves from the recipe sites as they post.
 */
export function CollectionsTab() {
  const { t } = useTranslation()
  const sitesOn = useCapability("sites")
  const { data, isPending } = useQuery(collectionsQuery)
  const collections = data?.collections ?? []

  return (
    <div className="grid gap-4">
      <p className="text-muted-foreground">
        {t("find.collections.description")}
      </p>
      {isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-72 rounded-3xl" />
          ))}
        </div>
      ) : collections.length === 0 ? (
        <Empty className="rounded-3xl border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={BookOpen01Icon} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>{t("find.collections.none")}</EmptyTitle>
            <EmptyDescription>
              {sitesOn
                ? t("find.collections.filling")
                : t("find.collections.off")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {collections.map((collection) => (
            <li key={collection.id}>
              <CollectionCard collection={collection} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** A collection's card: four of its photos, what it is, and how many. */
function CollectionCard({ collection }: { collection: CollectionSummary }) {
  const { t } = useTranslation()
  const photos = collection.photos.slice(0, 4)
  return (
    <Link
      to="/recipes/find/$collection"
      params={{ collection: collection.id }}
      className="group grid h-full grid-rows-[auto_1fr] overflow-hidden rounded-3xl border bg-card text-card-foreground transition-shadow hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <div className="grid aspect-[16/10] grid-cols-2 grid-rows-2 gap-0.5 bg-muted">
        {photos.map((photo, index) => (
          <img
            key={photo}
            src={photo}
            alt=""
            loading="lazy"
            className={
              photos.length === 1
                ? "col-span-2 row-span-2 size-full object-cover"
                : photos.length === 2 || (photos.length === 3 && index === 0)
                  ? "row-span-2 size-full object-cover"
                  : "size-full object-cover"
            }
          />
        ))}
      </div>
      <div className="grid content-start gap-1 p-4">
        <h3 className="font-heading text-lg font-semibold group-hover:underline">
          {collection.title}
        </h3>
        <p className="text-sm text-muted-foreground">
          {collection.description}
        </p>
        <p className="text-sm font-medium">
          {collection.toImport === collection.count
            ? t("find.collections.count", { count: collection.count })
            : t("find.collections.countNew", {
                count: collection.count,
                new: collection.toImport,
              })}
        </p>
      </div>
    </Link>
  )
}
