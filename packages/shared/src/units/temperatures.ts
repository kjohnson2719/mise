import type { UnitSystem } from "./convert.ts"

// "350°F", "350 °F", "350 degrees F", "180 degrees Celsius", "350F". A plain
// "350°" says neither, so it's left alone, and so is "2 C", which is cups.
const TEMPERATURE =
  /(\d{2,3})(?:\s*(?:°|º)\s*|\s*degrees?\s+|(?=F\b))(F|C|Fahrenheit|Celsius)\b/gi

/** To the nearest 5 degrees, as ovens are set. */
const nearestFive = (degrees: number) => Math.round(degrees / 5) * 5

/** Oven and other temperatures in a step, in the chosen system's degrees. */
export function convertTemperatures(text: string, system: UnitSystem): string {
  if (system === "written") return text
  return text.replace(TEMPERATURE, (match, value: string, scale: string) => {
    const fahrenheit = scale[0]!.toUpperCase() === "F"
    const degrees = Number(value)
    if (system === "metric" && fahrenheit) {
      return `${nearestFive(((degrees - 32) * 5) / 9)}°C`
    }
    if (system === "us" && !fahrenheit) {
      return `${nearestFive((degrees * 9) / 5 + 32)}°F`
    }
    return match
  })
}
