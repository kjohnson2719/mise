// What's shown short ("1 ⅓ tbsp", "350°F") said in full, so it's easy to
// follow out loud. Each language Merran is read aloud in has its own.

const FRACTION_WORDS: Record<string, { after: string; alone: string }> = {
  "½": { after: "a half", alone: "half a" },
  "⅓": { after: "a third", alone: "a third of a" },
  "⅔": { after: "two thirds", alone: "two thirds of a" },
  "¼": { after: "a quarter", alone: "a quarter of a" },
  "¾": { after: "three quarters", alone: "three quarters of a" },
  "⅛": { after: "an eighth", alone: "an eighth of a" },
  "⅜": { after: "three eighths", alone: "three eighths of a" },
  "⅝": { after: "five eighths", alone: "five eighths of a" },
  "⅞": { after: "seven eighths", alone: "seven eighths of a" },
}

const ENGLISH: [RegExp, string | ((...groups: string[]) => string)][] = [
  // "1 ⅓" is "1 and a third"; "½ cup" is "half a cup".
  [
    /(\d) ?([½⅓⅔¼¾⅛⅜⅝⅞])/g,
    (_, whole, fraction) => `${whole} and ${FRACTION_WORDS[fraction!]!.after}`,
  ],
  [
    /(^|[\s(])([½⅓⅔¼¾⅛⅜⅝⅞]) /g,
    (_, before, fraction) => `${before}${FRACTION_WORDS[fraction!]!.alone} `,
  ],
  // "5–7 minutes" is "5 to 7 minutes".
  [/(\d) ?[–—-] ?(\d)/g, "$1 to $2"],
  [/(\d) ?°F\b/g, "$1 degrees Fahrenheit"],
  [/(\d) ?°C\b/g, "$1 degrees Celsius"],
  // One of something, or a part of one, is singular.
  [/\b(1|a) tbsps?\b/gi, "$1 tablespoon"],
  [/\b(1|a) tsps?\b/gi, "$1 teaspoon"],
  [/\b(1|a) lbs?\b/gi, "$1 pound"],
  [/\b(1|a) fl oz\b/gi, "$1 fluid ounce"],
  [/\b(1|a) oz\b/gi, "$1 ounce"],
  [/\b1 ?kg\b/gi, "1 kilogram"],
  [/\b1 ?ml\b/gi, "1 milliliter"],
  [/\b1 ?g\b/g, "1 gram"],
  [/\btbsps?\b/gi, "tablespoons"],
  [/\btsps?\b/gi, "teaspoons"],
  [/\blbs?\b/gi, "pounds"],
  [/\bfl oz\b/gi, "fluid ounces"],
  [/\boz\b/gi, "ounces"],
  // "500ml" and "500 ml" both.
  [/(\d) ?kg\b/gi, "$1 kilograms"],
  [/(\d) ?ml\b/gi, "$1 milliliters"],
  [/(\d) ?g\b/g, "$1 grams"],
]

const LANGUAGES: Record<string, typeof ENGLISH> = { en: ENGLISH }

/** "1 ⅓ tbsp", "350°F", "28 g" → "1 and a third tablespoons", "350 degrees Fahrenheit", "28 grams". */
export function forSpeech(text: string, language = "en") {
  const rules = LANGUAGES[language.toLowerCase().split(/[-_]/)[0]!]
  if (!rules) return text
  return rules.reduce(
    (spoken, [pattern, words]) =>
      typeof words === "string"
        ? spoken.replace(pattern, words)
        : spoken.replace(pattern, words as (...groups: string[]) => string),
    text
  )
}
