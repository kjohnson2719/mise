import { queryOptions } from "@tanstack/react-query"

import { api, unwrap, type Schemas } from "@/lib/api/client"

export type PantryItem = Schemas["PantryItem"]
export type PantrySnapshot = Schemas["PantrySnapshot"]
export type StoragePlace = NonNullable<PantryItem["storedIn"]>
export type UseSoon = NonNullable<PantryItem["useSoon"]>

export const STORAGE_PLACES: readonly StoragePlace[] = [
  "fridge",
  "freezer",
  "cupboard",
]

/** What's at home: the fridge, the freezer, then the cupboard. */
export const pantryQuery = queryOptions({
  queryKey: ["pantry"],
  queryFn: () => unwrap(api.GET("/api/pantry")),
})
