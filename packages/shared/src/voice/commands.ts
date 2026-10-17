/** Something said while cooking hands-free, as a command. */
export type CookCommand =
  | { kind: "next" }
  | { kind: "back" }
  | { kind: "repeat" }
  | { kind: "ingredients" }
  | { kind: "timer"; seconds: number }
  | { kind: "stepTimer" }
  | { kind: "howMuch"; food: string }
  | { kind: "stop" }
  | { kind: "done" }

type Phrase = Exclude<CookCommand["kind"], "timer" | "howMuch">

/** How commands are said in one language. */
type CommandWords = {
  /** Words around a command that don't change it: "okay", "please". */
  filler: RegExp
  /** Whole phrases for each simple command. */
  phrases: [Phrase, RegExp][]
  /** "set a timer for 10 minutes" → 600, or null. */
  timer: (text: string) => number | null
  /** "how much garlic" → "garlic" in the first group. */
  howMuch: RegExp
}

const ENGLISH_NUMBERS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  ninety: 90,
}

/** "10", "ten", "twenty five", "2.5" → a number, or null. */
function englishNumber(words: string) {
  const trimmed = words.trim()
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed)
  let total = 0
  for (const word of trimmed.split(/[\s-]+/)) {
    const value = ENGLISH_NUMBERS[word]
    if (value === undefined) return null
    total += value
  }
  return total || null
}

const ENGLISH_UNITS: Record<string, number> = {
  second: 1,
  sec: 1,
  minute: 60,
  min: 60,
  hour: 3600,
}

const MOST_SECONDS = 24 * 3600

const ENGLISH: CommandWords = {
  filler:
    /^(?:(?:ok(?:ay)?|hey|so|um+|uh+|please|merran|alright)\s+)+|\s+(?:please|thanks|thank you)$/g,
  phrases: [
    ["next", /^(?:next|next step|go on|continue|keep going|go ahead|forward)$/],
    ["back", /^(?:back|go back|previous|previous step|last step|step back)$/],
    [
      "repeat",
      /^(?:repeat|repeat that|again|say (?:that|it) again|read it|read that|read (?:the )?step|what was that|come again)$/,
    ],
    [
      "ingredients",
      /^(?:ingredients|what do i need|which ingredients|what goes in|read (?:the )?ingredients)$/,
    ],
    ["stop", /^(?:stop|quiet|be quiet|shh+|hush|stop talking|stop reading)$/],
    ["done", /^(?:done|i'?m done|finished|all done|done cooking)$/],
    ["stepTimer", /^(?:start (?:the )?timer|start it|set (?:the )?timer)$/],
  ],
  timer: (text) => {
    if (!/\btimer\b/.test(text)) return null
    // "set a timer for half an hour", "half an hour timer"
    if (/\bhalf an hour\b/.test(text)) return 1800
    // "set a timer for 10 minutes", "timer 90 seconds", "start a five minute timer"
    const match = text.match(
      /^(?:set |start )?(?:a |the )?(?:timer (?:for )?)?([\w.\s-]+?) (second|sec|minute|min|hour)s? ?(?:timer)?$/
    )
    if (!match) return null
    const amount = englishNumber(match[1]!)
    const seconds = amount ? Math.round(amount * ENGLISH_UNITS[match[2]!]!) : 0
    return seconds > 0 && seconds <= MOST_SECONDS ? seconds : null
  },
  howMuch:
    /^how (?:much|many)(?: of(?: the)?| the)? (.+?)(?: (?:do|should|did) i (?:need|use|add|put in))?(?: again)?$/,
}

/** Command words by language. A language Merran is translated into adds its own. */
const LANGUAGES: Record<string, CommandWords> = { en: ENGLISH }

const baseLanguage = (language: string) =>
  language.toLowerCase().split(/[-_]/)[0]!

/**
 * Reads what was said while cooking. Whole phrases only ("next", "go back",
 * "timer for 10 minutes", "how much garlic"), so talk in the kitchen
 * ("what's next for dinner?") doesn't turn the page.
 */
export function parseCookCommand(
  said: string,
  language = "en"
): CookCommand | null {
  const words = LANGUAGES[baseLanguage(language)] ?? ENGLISH
  const text = said
    .toLowerCase()
    .replace(/[.,!?;:"]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(words.filler, "")
    .trim()
  if (!text) return null

  for (const [kind, pattern] of words.phrases) {
    if (pattern.test(text)) return { kind }
  }
  const seconds = words.timer(text)
  if (seconds) return { kind: "timer", seconds }
  const food = text.match(words.howMuch)?.[1]?.trim()
  if (food) return { kind: "howMuch", food }
  return null
}
