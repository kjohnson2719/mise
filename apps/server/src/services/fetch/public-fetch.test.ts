import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import { describe, expect, test } from "vitest"
import {
  checkLink,
  createPublicFetcher,
  isBlockedAddress,
} from "./public-fetch.ts"

describe("public fetches", () => {
  test("never reach private, local or special addresses", () => {
    for (const address of [
      "127.0.0.1",
      "10.1.2.3",
      "172.20.0.5",
      "192.168.1.10",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "::1",
      "fd00::1",
      "fe80::1",
      "::ffff:10.0.0.1",
      "not an address",
    ]) {
      expect(isBlockedAddress(address), address).toBe(true)
    }
    for (const address of ["93.184.216.34", "1.1.1.1", "2606:4700::1111"]) {
      expect(isBlockedAddress(address), address).toBe(false)
    }
  })

  test("take only http and https links to public places", () => {
    expect(checkLink("https://example.com/soup").hostname).toBe("example.com")
    expect(() => checkLink("ftp://example.com")).toThrow(/link/)
    expect(() => checkLink("file:///etc/passwd")).toThrow(/link/)
    expect(() => checkLink("not a link")).toThrow(/link/)
    expect(() => checkLink("http://192.168.1.1/admin")).toThrow(/private/)
    expect(() => checkLink("http://[::1]:3000/")).toThrow(/private/)
  })

  test("refuse a name that leads to this machine", async () => {
    // A real server on this machine, reached by name rather than address:
    // the lookup itself is checked, not just the link.
    const server = createServer((_, res) => res.end("secret"))
    await new Promise<void>((resolve) => server.listen(0, resolve))
    const { port } = server.address() as AddressInfo
    const fetcher = createPublicFetcher({ version: "0.0.0" })

    await expect(fetcher(`http://localhost:${port}/`)).rejects.toThrow(
      /private network/
    )
    server.close()
  })

  test("reach the home network only when asked, and stay there", async () => {
    // Like the server admin's Mealie: on this network, wanting a token.
    const server = createServer((req, res) => {
      if (req.url === "/away") {
        res.writeHead(302, { location: "https://example.com/" })
        return res.end()
      }
      if (req.headers.authorization !== "Bearer token") {
        res.writeHead(401)
        return res.end("Sign in")
      }
      res.end("hello")
    })
    await new Promise<void>((resolve) => server.listen(0, resolve))
    const { port } = server.address() as AddressInfo
    const fetcher = createPublicFetcher({ version: "0.0.0" })
    const home = `http://127.0.0.1:${port}`

    await expect(fetcher(`${home}/`)).rejects.toThrow(/private network/)
    const answer = await fetcher(`${home}/`, {
      homeNetwork: true,
      headers: { authorization: "Bearer token" },
    })
    expect(answer.body.toString()).toBe("hello")
    const refused = await fetcher(`${home}/`, {
      homeNetwork: true,
      keepErrors: true,
    })
    expect(refused.status).toBe(401)
    await expect(
      fetcher(`${home}/away`, { homeNetwork: true })
    ).rejects.toThrow(/redirects somewhere else/)
    server.close()
  })
})
