import {
  compareVersions,
  isDevBuild,
  isPrerelease,
  parseVersion,
} from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import { z } from "zod"
import type { AppDeps } from "../../core/context.ts"
import { enqueue } from "../../services/jobs/jobs.ts"
import type { JobHandler } from "../../services/jobs/runner.ts"
import { UPDATES, type ReleaseFound } from "./settings.ts"

// The update check (docs/operations.md, "Releases and updates"): every 6
// hours, Merran's releases on GitHub, for the newest one this server would
// update to. A server on a pre-release hears about newer pre-releases too;
// one on a release only about releases. A build that isn't a release (from
// source, or the edge image) isn't checked.

/** Merran's releases, newest first. */
export const RELEASES_URL =
  "https://api.github.com/repos/merran-app/merran/releases?per_page=30"

type UpdateDeps = Pick<AppDeps, "config" | "settings" | "fetcher">

const GithubRelease = z.object({
  tag_name: z.string(),
  name: z.string().nullable(),
  html_url: z.string(),
  body: z.string().nullable(),
  published_at: z.string().nullable(),
  draft: z.boolean(),
  prerelease: z.boolean(),
})

/**
 * The newest of GitHub's releases this version would update to: releases,
 * and pre-releases too when it's a pre-release itself. Null when there
 * isn't one.
 */
export function newestRelease(
  answer: unknown,
  current: string
): ReleaseFound | null {
  const releases = z.array(z.unknown()).catch([]).parse(answer)
  const wanted = isPrerelease(current)
  let newest: ReleaseFound | null = null
  for (const raw of releases) {
    const release = GithubRelease.safeParse(raw)
    if (!release.success || release.data.draft) continue
    const version = release.data.tag_name.replace(/^v/, "")
    if (!parseVersion(version)) continue
    // A pre-release by its version, or as GitHub marks it.
    const prerelease = isPrerelease(version) || release.data.prerelease
    if (prerelease && !wanted) continue
    if (newest && compareVersions(version, newest.version) <= 0) continue
    newest = {
      version,
      name: release.data.name?.trim() || `Merran ${version}`,
      url: release.data.html_url,
      notes: (release.data.body ?? "").slice(0, 20_000),
      publishedAt: release.data.published_at,
      prerelease,
    }
  }
  return newest
}

/** Looks for a newer release now, and keeps what it found. */
export async function checkForUpdates(deps: UpdateDeps, em: EntityManager) {
  if (isDevBuild(deps.config.version)) return
  if (!(await deps.settings.server(UPDATES.check))) return
  const checkedAt = new Date().toISOString()
  try {
    const answer = await deps.fetcher(RELEASES_URL, {
      accept: "application/vnd.github+json",
      maxBytes: 5_000_000,
    })
    const release = newestRelease(
      JSON.parse(answer.body.toString("utf8")),
      deps.config.version
    )
    await deps.settings.keepServer(em, UPDATES.latest, {
      checkedAt,
      release,
      error: null,
    })
  } catch (error) {
    // What it found before still stands; it says it couldn't look.
    const before = await deps.settings.server(UPDATES.latest)
    await deps.settings.keepServer(em, UPDATES.latest, {
      checkedAt,
      release: before?.release ?? null,
      error: (error as Error).message.slice(0, 300),
    })
  }
}

/** What Settings shows about updates, for the server admin. */
export async function describeUpdates(deps: UpdateDeps) {
  const current = deps.config.version
  const devBuild = isDevBuild(current)
  const kept = await deps.settings.server(UPDATES.latest)
  const latest = kept?.release ?? null
  return {
    current,
    devBuild,
    checking: !devBuild && (await deps.settings.server(UPDATES.check)),
    checkedAt: kept?.checkedAt ?? null,
    error: kept?.error ?? null,
    latest,
    newer: Boolean(
      latest && !devBuild && compareVersions(latest.version, current) > 0
    ),
    installMethod: deps.config.installMethod,
  }
}

export const checkUpdatesJob: JobHandler = {
  kind: "updates.check",
  async run({ em, deps }) {
    await checkForUpdates(deps, em)
    return {}
  },
}

/** A look soon after Merran starts, so the badge doesn't wait 6 hours. */
export async function checkUpdatesSoon(em: EntityManager) {
  await enqueue(em, {
    kind: checkUpdatesJob.kind,
    key: "updates.check:start",
    runAt: new Date(Date.now() + 60_000),
    maxAttempts: 1,
  })
}
