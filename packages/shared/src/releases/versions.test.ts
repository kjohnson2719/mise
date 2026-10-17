import { describe, expect, test } from "vitest"
import {
  compareVersions,
  isDevBuild,
  isPrerelease,
  parseVersion,
} from "./versions.ts"

describe("versions", () => {
  test("are read as semver, with or without a v", () => {
    expect(parseVersion("v0.1.0-alpha.2")).toEqual({
      major: 0,
      minor: 1,
      patch: 0,
      prerelease: ["alpha", 2],
    })
    expect(parseVersion("1.4.2")).toMatchObject({ prerelease: [] })
    expect(parseVersion("1.4")).toBeNull()
    expect(parseVersion("latest")).toBeNull()
  })

  test("are newer as semver says", () => {
    const sorted = [
      "0.1.0-alpha.1",
      "0.1.0-alpha.2",
      "0.1.0-alpha.10",
      "0.1.0-beta.1",
      "0.1.0-rc.1",
      "0.1.0",
      "0.1.1",
      "0.2.0",
      "1.0.0",
    ]
    const shuffled = [...sorted].reverse()
    expect(shuffled.sort(compareVersions)).toEqual(sorted)
    expect(compareVersions("v0.1.0", "0.1.0")).toBe(0)
    // Something that isn't a version is never newer.
    expect(compareVersions("nonsense", "0.0.1")).toBeLessThan(0)
  })

  test("say when they're a pre-release, or not a release at all", () => {
    expect(isPrerelease("0.1.0-alpha.1")).toBe(true)
    expect(isPrerelease("0.1.0")).toBe(false)
    expect(isDevBuild("0.0.0")).toBe(true)
    expect(isDevBuild("0.0.0-edge.1a2b3c4")).toBe(true)
    expect(isDevBuild("0.3.0-dev")).toBe(true)
    expect(isDevBuild("0.1.0-alpha.1")).toBe(false)
    expect(isDevBuild("1.2.0")).toBe(false)
  })
})
