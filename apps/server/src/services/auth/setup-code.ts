import { randomInt, timingSafeEqual } from "node:crypto"

/** No 0/O or 1/I/L, so the code is easy to copy from a log. */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
const LENGTH = 12
const MAX_TRIES = 20
const WINDOW_MS = 15 * 60 * 1000

/**
 * The one-time code that claims a fresh server. It's printed in the log on
 * startup while there are no accounts, so a stranger who finds the page
 * first can't take it. It changes on every restart and stops working once
 * the first account exists.
 */
export class SetupCode {
  #code: string | null = null
  #failures: number[] = []

  /** Makes a new code. */
  issue(): string {
    this.#code = Array.from(
      { length: LENGTH },
      () => ALPHABET[randomInt(ALPHABET.length)]
    ).join("")
    return this.#code
  }

  get active(): boolean {
    return this.#code !== null
  }

  /** Too many wrong codes recently, from anyone. */
  get locked(): boolean {
    const since = Date.now() - WINDOW_MS
    this.#failures = this.#failures.filter((time) => time > since)
    return this.#failures.length >= MAX_TRIES
  }

  /** Checks a code, ignoring case, spaces and dashes. */
  check(input: string): boolean {
    if (!this.#code || this.locked) return false
    const given = Buffer.from(input.replace(/[\s-]/g, "").toUpperCase())
    const expected = Buffer.from(this.#code)
    const ok =
      given.length === expected.length && timingSafeEqual(given, expected)
    if (!ok) this.#failures.push(Date.now())
    return ok
  }

  /** The first account exists: the code is done. */
  retire(): void {
    this.#code = null
  }
}
