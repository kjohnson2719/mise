import { lookup } from "node:dns"
import { BlockList, isIP } from "node:net"
import { Agent, fetch } from "undici"
import { AppError } from "../../core/errors.ts"

// The one way Merran fetches things from the internet for someone: pages
// to import, their photos, later feeds and store prices. It only reaches
// public addresses, so it can't be used to poke at machines on the home
// network, and it says honestly what it is. The one exception is an address
// the server admin gave, like their Mealie's (see `homeNetwork`).

/**
 * Addresses a public fetch must never reach: loopback, private networks,
 * link-local, carrier NAT, multicast and the like.
 */
const blocked = new BlockList()
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(network, prefix, "ipv4")
}
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(network, prefix, "ipv6")
}

export function isBlockedAddress(address: string) {
  const family = isIP(address)
  if (!family) return true
  // IPv4 inside IPv6 (::ffff:10.0.0.1). Public DNS never hands these out, and
  // BlockList can't hold the range without matching every IPv4 address.
  if (family === 6 && /^::ffff:/i.test(address)) return true
  return blocked.check(address, family === 6 ? "ipv6" : "ipv4")
}

/**
 * Looks names up itself and refuses to connect to a blocked address, so a
 * name that resolves to the home network is refused too, whenever it's
 * looked up.
 */
const publicAgent = new Agent({
  allowH2: true,
  connect: {
    lookup(hostname, options, callback) {
      lookup(hostname, { all: true }, (error, addresses) => {
        if (error) return callback(error, "", 4)
        const allowed = addresses.filter((a) => !isBlockedAddress(a.address))
        if (allowed.length === 0) {
          return callback(
            Object.assign(new Error(`${hostname} is a private address`), {
              code: "EBLOCKED",
            }),
            "",
            4
          )
        }
        if (options.all) return callback(null, allowed as never, 4)
        callback(null, allowed[0]!.address, allowed[0]!.family)
      })
    },
  },
})

/** For addresses the server admin gave, which may be on the home network. */
const homeAgent = new Agent({ allowH2: true })

/**
 * A fetch for another library to call an address with, like an AI SDK
 * provider on an OpenAI-compatible address: public addresses only, unless
 * it's one the server admin gave.
 */
export function addressFetch({
  homeNetwork,
}: {
  homeNetwork: boolean
}): typeof globalThis.fetch {
  return ((input: string | URL | Request, init?: RequestInit) =>
    fetch(input as string, {
      ...(init as object),
      dispatcher: homeNetwork ? homeAgent : publicAgent,
    })) as unknown as typeof globalThis.fetch
}

export type FetchedResource = {
  /** Where it ended up, after redirects. */
  url: string
  status: number
  contentType: string
  body: Buffer
  /** What the answer said it was, to ask next time only if it's changed. */
  etag?: string | null
  lastModified?: string | null
}

export type FetchOptions = {
  accept?: string
  maxBytes?: number
  /** The page asking, as a browser would say; some sites refuse photos without it. */
  referer?: string
  /** Sends this as JSON, in a POST, rather than asking for a page. */
  json?: unknown
  /** Sends this as a form, in a POST: what OAuth token endpoints take. */
  form?: Record<string, string>
  /** Another method than GET, or POST with a body: PUT, say. */
  method?: "GET" | "POST" | "PUT" | "DELETE"
  /** More headers, like a token. */
  headers?: Record<string, string>
  /**
   * The address is one the server admin gave, like their Mealie's, so it may
   * be on the home network. Only ever for an address the admin typed in;
   * redirects must stay where they started.
   */
  homeNetwork?: boolean
  /** Hands back an error answer, with its status, rather than throwing. */
  keepErrors?: boolean
}

export type Fetcher = (
  url: string,
  options?: FetchOptions
) => Promise<FetchedResource>

const notALink = () =>
  new AppError("invalid", "not_a_link", "That doesn't look like a link.", {
    url: "Use a full link, starting with https://",
  })

/**
 * A link Merran may fetch: http or https, and not to a private address
 * unless it's on the home network on purpose.
 */
export function checkLink(raw: string, { homeNetwork = false } = {}): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw notALink()
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw notALink()
  const host = url.hostname.replace(/^\[|\]$/g, "")
  if (!homeNetwork && isIP(host) && isBlockedAddress(host)) {
    throw privateAddress()
  }
  return url
}

const privateAddress = () =>
  new AppError(
    "invalid",
    "private_address",
    "That link goes to a private network address, which Merran won't fetch."
  )

const TIMEOUT_MS = 15_000
const MAX_REDIRECTS = 5

/**
 * Makes the fetcher. It follows up to 5 redirects, checking each one, and
 * gives up after 15 seconds or `maxBytes`.
 */
export function createPublicFetcher({ version }: { version: string }): Fetcher {
  const userAgent = `Merran/${version} (+https://merran.app)`

  return async (
    raw,
    {
      accept = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      maxBytes = 5_000_000,
      referer,
      json,
      form,
      method,
      headers = {},
      homeNetwork = false,
      keepErrors = false,
    } = {}
  ) => {
    let url = checkLink(raw, { homeNetwork })
    const start = url.origin
    const signal = AbortSignal.timeout(TIMEOUT_MS)

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      let response
      try {
        response = await fetch(url, {
          dispatcher: homeNetwork ? homeAgent : publicAgent,
          redirect: "manual",
          signal,
          ...(json === undefined
            ? {}
            : { method: method ?? "POST", body: JSON.stringify(json) }),
          ...(form === undefined
            ? {}
            : {
                method: method ?? "POST",
                body: new URLSearchParams(form).toString(),
              }),
          ...(method && json === undefined && form === undefined
            ? { method }
            : {}),
          headers: {
            "user-agent": userAgent,
            "accept-language": "en-US,en;q=0.9",
            accept,
            ...(referer ? { referer } : {}),
            ...(json === undefined
              ? {}
              : { "content-type": "application/json" }),
            ...(form === undefined
              ? {}
              : { "content-type": "application/x-www-form-urlencoded" }),
            ...headers,
          },
        })
      } catch (error) {
        const code = (error as { cause?: { code?: string } }).cause?.code
        if (code === "EBLOCKED") throw privateAddress()
        if ((error as Error).name === "TimeoutError") {
          throw new AppError(
            "upstream",
            "site_timeout",
            "That site took too long to answer."
          )
        }
        throw new AppError(
          "upstream",
          "site_unreachable",
          "Couldn't reach that site."
        )
      }

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location")
        await response.body?.cancel()
        // A POST isn't sent on to somewhere else.
        if (!location || json !== undefined || form !== undefined) {
          throw new AppError(
            "upstream",
            "site_error",
            "That site sent a broken redirect."
          )
        }
        url = checkLink(new URL(location, url).toString(), { homeNetwork })
        if (homeNetwork && url.origin !== start) {
          throw new AppError(
            "upstream",
            "site_error",
            "That address redirects somewhere else."
          )
        }
        continue
      }
      if (!response.ok && !keepErrors) {
        await response.body?.cancel()
        throw response.status === 403 || response.status === 429
          ? new AppError(
              "upstream",
              "site_refused",
              "That site turned Merran away. Type the recipe in instead."
            )
          : new AppError(
              "upstream",
              "site_error",
              `That site answered with an error (${response.status}).`
            )
      }

      const chunks: Buffer[] = []
      let size = 0
      for await (const chunk of response.body ?? []) {
        size += chunk.length
        if (size > maxBytes) {
          throw new AppError(
            "too_large",
            "too_large",
            "That's too large to fetch."
          )
        }
        chunks.push(Buffer.from(chunk))
      }
      return {
        url: url.toString(),
        status: response.status,
        contentType: response.headers.get("content-type") ?? "",
        body: Buffer.concat(chunks),
        etag: response.headers.get("etag"),
        lastModified: response.headers.get("last-modified"),
      }
    }
    throw new AppError(
      "upstream",
      "too_many_redirects",
      "That link redirects too many times."
    )
  }
}
