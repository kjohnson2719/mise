import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { updatedAt } from "./base.ts"
import { Secret } from "./secrets.ts"
import { User } from "./users.ts"

/**
 * Server settings changed in the app, one row each. A setting with no row
 * uses its environment variable or its default (see core/settings.ts).
 */
export const ServerSetting = defineEntity({
  name: "ServerSetting",
  tableName: "server_settings",
  properties: {
    /** The setting's key, like "errorTracking.dsn". */
    key: p.string().primary(),
    value: p.json<unknown>().nullable(),
    /** Where a secret setting's value is kept instead. */
    secret: () => p.manyToOne(Secret).ref().nullable().deleteRule("set null"),
    updatedAt: updatedAt(),
    updatedBy: () => p.manyToOne(User).ref().nullable().deleteRule("set null"),
  },
})
export type ServerSetting = InferEntity<typeof ServerSetting>
