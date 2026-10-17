import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { householdFilter } from "../scope.ts"
import { id, updatedAt } from "./base.ts"
import { householdRef } from "./households.ts"
import { Secret } from "./secrets.ts"
import { User } from "./users.ts"

/**
 * A household's settings, one row each, like its own AI keys. A setting with
 * no row uses its default (see core/settings.ts). Deleting a household must
 * delete the secrets these point at too.
 */
export const HouseholdSetting = defineEntity({
  name: "HouseholdSetting",
  tableName: "household_settings",
  properties: {
    id: id(),
    household: () => householdRef(),
    key: p.string(),
    value: p.json<unknown>().nullable(),
    /** Where a secret setting's value is kept instead. */
    secret: () => p.manyToOne(Secret).ref().nullable().deleteRule("set null"),
    updatedAt: updatedAt(),
    updatedBy: () => p.manyToOne(User).ref().nullable().deleteRule("set null"),
  },
  uniques: [{ properties: ["household", "key"] }],
  filters: householdFilter,
})
export type HouseholdSetting = InferEntity<typeof HouseholdSetting>
