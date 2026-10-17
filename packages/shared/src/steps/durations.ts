/**
 * A step in pieces: its words, and the times in it that can start a timer.
 * A time keeps its words as written ("a minute"), and its length in seconds
 * to show and say the same way everywhere ("1 minute"). A range ("5–7 min")
 * is `seconds` to `upTo`.
 */
export type StepPiece =
  | { type: "text"; text: string }
  | { type: "duration"; text: string; seconds: number; upTo: number | null }

const NUMBER = String.raw`\d+(?:[.,]\d+)?(?:\s*[½¼¾])?|[½¼¾]|\bhalf an?\b|\ban?\b`

// "25 minutes", "1½ hours", "5–7 min", "10 to 12 mins", "30 secs", and in
// words, "a minute", "an hour", "half an hour".
const DURATION = new RegExp(
  String.raw`(${NUMBER})(?:\s*(?:-|–|—|to)\s*(${NUMBER}))?\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b`,
  "gi"
)

const FRACTIONS: Record<string, number> = { "½": 0.5, "¼": 0.25, "¾": 0.75 }

function amount(text: string) {
  const words = text.toLowerCase()
  if (words.startsWith("half")) return 0.5
  if (words === "a" || words === "an") return 1
  const fraction = text.match(/[½¼¾]/)?.[0]
  const whole = Number(text.replace(/[½¼¾]/, "").trim().replace(",", ".") || 0)
  return whole + (fraction ? FRACTIONS[fraction]! : 0)
}

const UNIT_SECONDS: Record<string, number> = { h: 3600, m: 60, s: 1 }

/**
 * Splits a step into its words and the times in it ("bake 25 minutes",
 * "simmer 5–7 min"), so each time can start a timer. A range starts at the
 * low end, to check early.
 */
export function splitDurations(step: string): StepPiece[] {
  const pieces: StepPiece[] = []
  let last = 0
  for (const match of step.matchAll(DURATION)) {
    const unit = UNIT_SECONDS[match[3]![0]!.toLowerCase()]!
    const seconds = Math.round(amount(match[1]!) * unit)
    if (seconds <= 0) continue
    const upTo = match[2] ? Math.round(amount(match[2]) * unit) : 0
    if (match.index > last) {
      pieces.push({ type: "text", text: step.slice(last, match.index) })
    }
    pieces.push({
      type: "duration",
      text: match[0],
      seconds,
      upTo: upTo > seconds ? upTo : null,
    })
    last = match.index + match[0].length
  }
  if (last < step.length) pieces.push({ type: "text", text: step.slice(last) })
  return pieces
}

/** The first time in a step, if it has one. */
export function firstDuration(step: string) {
  return splitDurations(step).find(
    (piece): piece is Extract<StepPiece, { type: "duration" }> =>
      piece.type === "duration"
  )
}
