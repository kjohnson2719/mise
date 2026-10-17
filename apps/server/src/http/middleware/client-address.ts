import { BlockList, isIP } from "node:net"
import { getConnInfo } from "@hono/node-server/conninfo"
import type { MiddlewareHandler } from "hono"
import type { AppEnv } from "../../core/context.ts"
import { CLIENT_ADDRESS_HEADER } from "../../services/auth/auth.ts"

/** "127.0.0.1, 172.16.0.0/12" as a list to check addresses against. */
export function trustedProxies(list: string[]): BlockList {
  const blocks = new BlockList()
  for (const entry of list) {
    const [address = "", bits] = entry.split("/")
    const type = isIP(address) === 6 ? "ipv6" : "ipv4"
    if (bits) blocks.addSubnet(address, Number(bits), type)
    else blocks.addAddress(address, type)
  }
  return blocks
}

function check(blocks: BlockList, address: string) {
  const plain = address.replace(/^::ffff:/, "")
  const version = isIP(plain)
  if (version === 0) return false
  return blocks.check(plain, version === 6 ? "ipv6" : "ipv4")
}

/**
 * Who's really asking: the connection's address, or, when that's a proxy the
 * server admin trusts, the address it says it's passing on (walking back
 * through any more trusted proxies). `X-Forwarded-For` from anyone else is
 * ignored, so it can't be used to dodge rate limits.
 */
export function resolveClientAddress(
  connection: string | undefined,
  forwardedFor: string | undefined,
  trusted: BlockList
): string | undefined {
  let address = connection
  if (address && check(trusted, address)) {
    const hops = (forwardedFor ?? "")
      .split(",")
      .map((hop) => hop.trim())
      .filter(Boolean)
    while (hops.length > 0) {
      const hop = hops.pop()!
      address = hop
      if (!check(trusted, hop)) break
    }
  }
  return address
}

/** Puts the real client address on the request, for rate limits and logs. */
export function clientAddress(trusted: BlockList): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    let connection: string | undefined
    try {
      connection = getConnInfo(c).remote.address
    } catch {
      // Requests made in tests have no connection.
    }
    const address = resolveClientAddress(
      connection,
      c.req.header("x-forwarded-for"),
      trusted
    )

    if (address) c.req.raw.headers.set(CLIENT_ADDRESS_HEADER, address)
    else c.req.raw.headers.delete(CLIENT_ADDRESS_HEADER)
    await next()
  }
}
