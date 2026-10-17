import type { ErrorEvent } from "@sentry/node"
import { describe, expect, test } from "vitest"
import { scrubEvent, scrubText } from "./scrub.ts"

describe("error reports", () => {
  test("lose anything that looks like a key", () => {
    expect(
      scrubText(
        "Failed with mrn_3fK9aQzzzzzzzz and sk-ant-api03-abcdefghijklmnop at postgres://merran:hunter2@db/merran"
      )
    ).toBe("Failed with [redacted] and [redacted] at [redacted]db/merran")
    expect(scrubText("Authorization: Bearer abc.def.ghijklmnop")).toBe(
      "Authorization: [redacted]"
    )
  })

  test("lose invite links' tokens", () => {
    expect(scrubText("GET https://merran.test/join/30GsIJ8M-OLqCHQ?x=1")).toBe(
      "GET https://merran.test/join/[token]?x=1"
    )
  })

  test("keep only the method and address of a request", () => {
    const event = scrubEvent({
      type: undefined,
      message: "Couldn't use sk-proj-abcdefghijklmnopqrst",
      request: {
        method: "POST",
        url: "https://merran.test/join/abcdefgh",
        headers: { cookie: "merran.session_token=secret" },
        cookies: { "merran.session_token": "secret" },
        data: { password: "hunter2" },
      },
      user: { id: "1", email: "kyle@example.com" },
      server_name: "kitchen-nas",
      breadcrumbs: [{ message: "signed in as kyle" }],
      exception: {
        values: [{ type: "Error", value: "Bad key mrn_abcdefghijkl" }],
      },
      extra: { body: { note: "token eyJhbGciOiJI.eyJzdWIiOiIx.c2lnbmF0dXJl" } },
    } as ErrorEvent)

    expect(event.request).toEqual({
      method: "POST",
      url: "https://merran.test/join/[token]",
    })
    expect(event.user).toBeUndefined()
    expect(event.server_name).toBeUndefined()
    expect(event.breadcrumbs).toBeUndefined()
    expect(event.message).toBe("Couldn't use [redacted]")
    expect(event.exception?.values?.[0]?.value).toBe("Bad key [redacted]")
    expect(event.extra).toEqual({ body: { note: "token [redacted]" } })
  })
})
