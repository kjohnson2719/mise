import createClient from "openapi-fetch"
import { useEffect, useState } from "react"

import type { components, paths } from "./schema"

// The Merrans and households this extension is connected to, and their
// API, called as the person with the key Merran gave the extension for
// each household when they connected it: a key works in one household. The
// same public API anyone else uses (schema.d.ts, made by `pnpm api`).

export type Schemas = components["schemas"]

/** A connection to one household, kept in the extension's own storage. */
export type Connection = {
  /** "https://merran.example.com" */
  origin: string
  /** The extension's API key: what it may do is in Merran, Settings, You. */
  token: string
  /** The key's id. */
  keyId: string
  /** The household it imports into and shops for. */
  householdId: string
  household: string
}

type Stored = { connections: Connection[]; active: string | null }

async function stored(): Promise<Stored> {
  const { connections, active } = await browser.storage.local.get([
    "connections",
    "active",
  ])
  return {
    connections: (connections as Connection[] | undefined) ?? [],
    active: (active as string | undefined) ?? null,
  }
}

/** The household in use, and every one connected. */
export async function getConnections() {
  const { connections, active } = await stored()
  const current =
    connections.find((one) => one.keyId === active) ?? connections[0] ?? null
  return { current, all: connections }
}

/** The household in use: what's added goes there, and its list shows. */
export async function getConnection(): Promise<Connection | null> {
  return (await getConnections()).current
}

/**
 * Keeps a connection and uses it: in place of one to the same household,
 * whose key Merran still has until it's taken away there.
 */
export async function addConnection(connection: Connection) {
  const { connections } = await stored()
  const others = connections.filter(
    (one) =>
      !(
        one.origin === connection.origin &&
        one.householdId === connection.householdId
      )
  )
  await browser.storage.local.set({
    connections: [...others, connection],
    active: connection.keyId,
  })
}

/** Switches to another connected household. */
export async function switchHousehold(keyId: string) {
  await browser.storage.local.set({ active: keyId })
}

/** Forgets a household's connection, and uses another if there is one. */
export async function removeConnection(keyId: string) {
  const { connections, active } = await stored()
  const left = connections.filter((one) => one.keyId !== keyId)
  await browser.storage.local.set({
    connections: left,
    active: active === keyId ? (left[0]?.keyId ?? null) : active,
  })
}

/** Calls `listener` with the connections whenever they change. */
export function onConnectionChange(
  listener: (connections: Awaited<ReturnType<typeof getConnections>>) => void
) {
  const changed = (changes: Record<string, unknown>) => {
    if ("connections" in changes || "active" in changes) {
      void getConnections().then(listener)
    }
  }
  browser.storage.local.onChanged.addListener(changed)
  return () => browser.storage.local.onChanged.removeListener(changed)
}

/** Watches the connections, for a page: undefined until they're read. */
export function useConnections() {
  const [connections, setConnections] = useState<
    Awaited<ReturnType<typeof getConnections>> | undefined
  >()
  useEffect(() => {
    void getConnections().then(setConnections)
    return onConnectionChange(setConnections)
  }, [])
  return connections
}

/** The connected Merran's API, as the person. */
export function apiFor(connection: Pick<Connection, "origin" | "token">) {
  return createClient<paths>({
    baseUrl: connection.origin,
    headers: { authorization: `Bearer ${connection.token}` },
  })
}

/** Something Merran said no to, or couldn't be reached for. */
export class MerranError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = "MerranError"
    this.status = status
    this.code = code
  }
}

/** The data from an API call, or a MerranError saying why not. */
export async function unwrap<T>(
  call: Promise<{ data?: T; error?: unknown; response: Response }>,
  origin?: string
): Promise<T> {
  let result: Awaited<typeof call>
  try {
    result = await call
  } catch {
    const where = origin ? new URL(origin).host : "Merran"
    throw new MerranError(0, "unreachable", `Couldn't reach ${where}.`)
  }
  const { data, error, response } = result
  if (response.ok) return data as T
  const said = (error as { error?: { code?: string; message?: string } })?.error
  if (response.status === 401) {
    throw new MerranError(
      401,
      "disconnected",
      "Merran doesn't know this extension any more. Connect it again."
    )
  }
  throw new MerranError(
    response.status,
    said?.code ?? "error",
    said?.message ?? `Merran answered ${response.status}.`
  )
}

/** A Merran on this computer or the home network, which is often plain http. */
const LOCAL =
  /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|[\w-]+\.(local|lan|home\.arpa))(:\d+)?(\/|$)/i

/**
 * "merran.example.com" or a full link, as the origin to connect to: https,
 * unless it says otherwise or is on this computer or the home network.
 */
export function originOf(input: string) {
  const text = input.trim()
  const scheme = /^https?:\/\//i.test(text)
    ? ""
    : LOCAL.test(text)
      ? "http://"
      : "https://"
  return new URL(`${scheme}${text}`).origin
}

/** What the extension's key may do: import, see the plan, and keep the list. */
export const KEY_PERMISSIONS = {
  household: "read",
  recipes: "write",
  imports: "write",
  plan: "read",
  list: "write",
} as const
