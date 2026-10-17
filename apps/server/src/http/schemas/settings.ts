import { z } from "@hono/zod-openapi"
import { SECRET_SETTING, SETTING } from "./examples.ts"

export const SettingStateSchema = z
  .object({
    key: z.string().openapi({ example: "errorTracking.environment" }),
    kind: z.enum([
      "text",
      "number",
      "switch",
      "choice",
      "list",
      "secret",
      "json",
    ]),
    value: z.unknown().openapi({
      description:
        "Its value, or null for a secret or a setting that isn't set.",
    }),
    default: z.unknown(),
    source: z.enum(["default", "saved", "environment"]),
    lockedBy: z.string().nullable().openapi({
      description:
        "The environment variable that sets it, which means it can't be changed here.",
      example: "MERRAN_SENTRY_ENVIRONMENT",
    }),
    secret: z
      .object({
        set: z.boolean(),
        hint: z.string().nullable().openapi({
          description: "Its last four characters, when it's long enough.",
        }),
        unreadable: z.boolean().openapi({
          description:
            "Sealed with another master key, so it needs entering again.",
        }),
      })
      .optional(),
    choices: z.array(z.string()).optional(),
  })
  .openapi("SettingState", { example: SETTING })

export const SettingChangesSchema = z
  .record(z.string(), z.unknown())
  .openapi("SettingChanges", {
    description:
      "New values by key. Null puts a setting back to its default, and deletes a secret.",
    example: {
      "errorTracking.environment": "home",
      "errorTracking.dsn": null,
    },
  })

export const ServerSettingsSchema = z
  .object({
    about: z.object({
      version: z.string(),
      installMethod: z.enum(["source", "docker"]),
      database: z.enum(["sqlite", "postgres"]),
      publicUrl: z.string().nullable(),
    }),
    settings: z.array(SettingStateSchema),
    video: z
      .object({
        ytDlp: z.string().nullable(),
        ffmpeg: z.string().nullable(),
        cookies: z.boolean(),
      })
      .openapi({
        description:
          "Video import's tools, by their versions, or null when they aren't there; and whether there's a cookies.txt for sites that want a signed-in session.",
      }),
    sites: z
      .object({
        sites: z.number(),
        recipes: z.number(),
        classics: z.object({ working: z.number(), all: z.number() }),
        readAt: z.iso.datetime().nullable(),
      })
      .openapi({
        description:
          "The recipe sites Merran reads, the recipes it has from them, how many of the starter collections' classics open, and when a site was last read.",
      }),
    kroger: z.object({ redirectUri: z.string().nullable() }).openapi({
      description:
        "The redirect address to give the Kroger developer app: null without a public address set, when it's this server's address and /api/stores/kroger/callback.",
    }),
  })
  .openapi("ServerSettings", {
    example: {
      about: {
        version: "0.1.0",
        installMethod: "docker",
        database: "sqlite",
        publicUrl: "https://merran.example.com",
      },
      settings: [SETTING, SECRET_SETTING],
      video: { ytDlp: "2026.08.19", ffmpeg: "8.0", cookies: false },
      sites: {
        sites: 12,
        recipes: 214,
        classics: { working: 71, all: 73 },
        readAt: "2026-10-15T18:30:00.000Z",
      },
      kroger: {
        redirectUri: "https://merran.example.com/api/stores/kroger/callback",
      },
    },
  })

export const HouseholdSettingsSchema = z
  .object({ settings: z.array(SettingStateSchema) })
  .openapi("HouseholdSettings", {
    description: "No module has household settings yet, so the list is empty.",
    example: { settings: [] },
  })

export const CapabilitiesSchema = z
  .object({
    version: z.string(),
    modules: z.array(
      z.object({
        id: z.string().openapi({ example: "errorTracking" }),
        on: z.boolean(),
        needs: z.string().optional().openapi({
          description: "When it's off, what it needs, as a stable code.",
          example: "dsn",
        }),
      })
    ),
    capabilities: z.array(z.string()).openapi({
      description: "What the modules that are on make possible.",
    }),
    client: z.record(z.string(), z.record(z.string(), z.unknown())).openapi({
      description:
        "What the web app needs from each module that's on, by module id.",
    }),
  })
  .openapi("Capabilities", {
    example: {
      version: "0.1.0",
      modules: [
        { id: "errorTracking", on: true },
        { id: "telemetry", on: true },
      ],
      capabilities: [],
      client: {
        errorTracking: {
          dsn: "https://public-key@errors.example.com/1",
          environment: "home",
          sampleRate: 1,
          release: "0.1.0",
        },
      },
    },
  })

export const TelemetryReportSchema = z
  .object({
    installId: z.string(),
    version: z.string(),
    install: z.string(),
    arch: z.string(),
    database: z.string().openapi({ example: "postgres 18" }),
    modules: z.record(z.string(), z.boolean()),
    households: z.string().openapi({ example: "2-5" }),
    people: z.string(),
    recipes: z.string(),
  })
  .openapi("TelemetryReport", {
    example: {
      installId: "0199e8b0-5a10-7a01-8b00-0000000000ff",
      version: "0.1.0",
      install: "docker",
      arch: "x64",
      database: "sqlite",
      modules: { errorTracking: true, telemetry: true },
      households: "1",
      people: "2-5",
      recipes: "100-499",
    },
  })

const RELEASE_EXAMPLE = {
  version: "0.1.0-alpha.2",
  name: "Merran 0.1.0-alpha.2",
  url: "https://github.com/merran-app/merran/releases/tag/v0.1.0-alpha.2",
  notes: "## What's new\n\n- Send splits the list across your stores.",
  publishedAt: "2026-10-20T16:00:00Z",
  prerelease: true,
}

export const UpdatesSchema = z
  .object({
    current: z.string().openapi({ description: "The version running." }),
    devBuild: z.boolean().openapi({
      description:
        "Not a release (from source, or the edge image), so it isn't checked.",
    }),
    checking: z.boolean().openapi({
      description:
        "It looks every 6 hours: on unless MERRAN_UPDATE_CHECK says no.",
    }),
    checkedAt: z.iso.datetime().nullable(),
    error: z
      .string()
      .nullable()
      .openapi({ description: "Why the last look didn't work, if it didn't." }),
    latest: z
      .object({
        version: z.string(),
        name: z.string(),
        url: z.string(),
        notes: z.string().openapi({ description: "In Markdown." }),
        publishedAt: z.string().nullable(),
        prerelease: z.boolean(),
      })
      .nullable()
      .openapi({
        description:
          "The newest release this server would update to: pre-releases too when it runs one.",
      }),
    newer: z
      .boolean()
      .openapi({ description: "The latest is newer than what's running." }),
    installMethod: z.enum(["source", "docker"]),
  })
  .openapi("Updates", {
    example: {
      current: "0.1.0-alpha.1",
      devBuild: false,
      checking: true,
      checkedAt: "2026-10-20T18:53:00.000Z",
      error: null,
      latest: RELEASE_EXAMPLE,
      newer: true,
      installMethod: "docker",
    },
  })
