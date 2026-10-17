import { z } from "zod"
import { jsonSetting, switchSetting } from "../../core/settings.ts"

/** A release the update check found, as Settings shows it. */
export const ReleaseFound = z.object({
  version: z.string(),
  name: z.string(),
  url: z.string(),
  /** Its release notes, in Markdown. */
  notes: z.string(),
  publishedAt: z.string().nullable(),
  prerelease: z.boolean(),
})
export type ReleaseFound = z.infer<typeof ReleaseFound>

export const UPDATES = {
  check: switchSetting({
    key: "updates.check",
    env: "MERRAN_UPDATE_CHECK",
    description:
      "Ask GitHub every 6 hours for Merran's newest release, to show the server admin an Update badge with its notes. Nothing about this server is sent.",
    default: true,
  }),
  latest: jsonSetting({
    key: "updates.latest",
    internal: true,
    description:
      "The newest release the update check found, when it last looked, and why it couldn't if it couldn't.",
    schema: z
      .object({
        checkedAt: z.string(),
        release: ReleaseFound.nullable(),
        error: z.string().nullable(),
      })
      .nullable(),
    default: null,
  }),
}
