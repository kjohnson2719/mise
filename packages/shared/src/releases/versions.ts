// Merran's versions (docs/operations.md, "Releases and updates"): semantic
// versions, "0.1.0", "0.1.0-alpha.2", compared as semver says, so the update
// check knows which release is newer. A build that isn't a release (from
// source, or the edge image of every commit to main) says so, and isn't
// checked for updates.

export type Version = {
  major: number
  minor: number
  patch: number
  /** "alpha.2" in "0.1.0-alpha.2": a release before 0.1.0. Empty for none. */
  prerelease: (string | number)[]
}

/** A version, from "0.1.0-alpha.2" or "v0.1.0"; null if it isn't one. */
export function parseVersion(text: string): Version | null {
  const match =
    /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(
      text.trim()
    )
  if (!match) return null
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4]
      ? match[4]
          .split(".")
          .map((part) => (/^\d+$/.test(part) ? Number(part) : part))
      : [],
  }
}

/**
 * Which is newer, by semver's precedence: negative when `a` is older,
 * positive when it's newer, 0 when they're the same. A pre-release comes
 * before its release (0.1.0-alpha.2 before 0.1.0); something that isn't a
 * version comes before every version.
 */
export function compareVersions(a: string, b: string): number {
  const x = parseVersion(a)
  const y = parseVersion(b)
  if (!x || !y) return (x ? 1 : 0) - (y ? 1 : 0)
  const core = x.major - y.major || x.minor - y.minor || x.patch - y.patch
  if (core !== 0) return core
  // A release is newer than any pre-release of it.
  if (x.prerelease.length === 0 || y.prerelease.length === 0) {
    return y.prerelease.length - x.prerelease.length
  }
  for (let i = 0; i < Math.max(x.prerelease.length, y.prerelease.length); i++) {
    const p = x.prerelease[i]
    const q = y.prerelease[i]
    if (p === undefined) return -1
    if (q === undefined) return 1
    if (p === q) continue
    // Numbers come before words; numbers by size, words A to Z.
    if (typeof p === "number" && typeof q === "number") return p - q
    if (typeof p === "number") return -1
    if (typeof q === "number") return 1
    return p < q ? -1 : 1
  }
  return 0
}

/** A pre-release: "0.1.0-alpha.2". */
export function isPrerelease(version: string) {
  return (parseVersion(version)?.prerelease.length ?? 0) > 0
}

/**
 * A build that isn't a release: from source (its package's "0.0.0"), or
 * the edge image built from every commit to main ("0.0.0-edge.1a2b3c4").
 */
export function isDevBuild(version: string) {
  const parsed = parseVersion(version)
  if (!parsed) return true
  const [first] = parsed.prerelease
  return (
    (parsed.major === 0 && parsed.minor === 0 && parsed.patch === 0) ||
    first === "edge" ||
    first === "dev"
  )
}
