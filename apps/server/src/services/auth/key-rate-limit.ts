/**
 * How many requests each API key may make in a window, so a runaway script
 * can't take the server down. Kept in memory: Merran is one process, and a
 * restart resetting the count does no harm.
 */
export class KeyRateLimit {
  readonly limit: number
  readonly windowMs: number
  #windows = new Map<string, { started: number; count: number }>()

  constructor(limit = 300, windowMs = 60_000) {
    this.limit = limit
    this.windowMs = windowMs
  }

  /** Counts a request. When it's over the limit, says how many seconds to wait. */
  hit(
    keyId: string,
    now = Date.now()
  ): { ok: true } | { ok: false; retryAfter: number } {
    let window = this.#windows.get(keyId)
    if (!window || now - window.started >= this.windowMs) {
      window = { started: now, count: 0 }
      this.#windows.set(keyId, window)
    }
    window.count += 1
    if (window.count <= this.limit) return { ok: true }
    return {
      ok: false,
      retryAfter: Math.ceil((window.started + this.windowMs - now) / 1000),
    }
  }
}
