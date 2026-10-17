import { describe, expect, test } from "vitest"
import { newestRelease } from "./check.ts"

// Which of Merran's releases on GitHub a server would update to.

const release = (tag: string, more: Record<string, unknown> = {}) => ({
  tag_name: tag,
  name: `Merran ${tag.replace(/^v/, "")}`,
  html_url: `https://github.com/merran-app/merran/releases/tag/${tag}`,
  body: `Notes for ${tag}`,
  published_at: "2026-10-20T16:00:00Z",
  draft: false,
  prerelease: tag.includes("-"),
  ...more,
})

describe("the newest release", () => {
  const releases = [
    release("v0.1.0-alpha.2"),
    release("v0.1.0-alpha.10"),
    release("v0.1.0-alpha.11", { draft: true }),
    release("nightly"),
    release("v0.0.9"),
  ]

  test("for a pre-release is the newest of any kind", () => {
    expect(newestRelease(releases, "0.1.0-alpha.1")).toMatchObject({
      version: "0.1.0-alpha.10",
      name: "Merran 0.1.0-alpha.10",
      notes: "Notes for v0.1.0-alpha.10",
      prerelease: true,
    })
  })

  test("for a release leaves pre-releases out", () => {
    expect(newestRelease(releases, "0.0.8")).toMatchObject({
      version: "0.0.9",
      prerelease: false,
    })
    expect(newestRelease([release("v0.1.0-alpha.2")], "0.0.8")).toBeNull()
  })

  test("from anything else is none", () => {
    expect(newestRelease({ message: "Not Found" }, "0.1.0-alpha.1")).toBeNull()
    expect(newestRelease([{ tag_name: 3 }], "0.1.0-alpha.1")).toBeNull()
  })
})
