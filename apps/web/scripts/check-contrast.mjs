// Checks WCAG contrast for every palette block in src/index.css.
// Run: pnpm --filter @merran/web check:contrast   (exits 1 if any pair fails)
import { readFileSync } from "node:fs"

const css = readFileSync(new URL("../src/index.css", import.meta.url), "utf8")

// [text token, background token, minimum ratio]
const PAIRS = [
  ["foreground", "background", 7],
  ["foreground", "card", 7],
  ["muted-foreground", "background", 4.5],
  ["muted-foreground", "card", 4.5],
  ["muted-foreground", "muted", 4.5],
  ["primary-foreground", "primary", 4.5],
  ["primary", "background", 4.5],
  ["primary", "card", 4.5],
  ["secondary-foreground", "secondary", 4.5],
  ["accent-foreground", "accent", 4.5],
  ["highlight-foreground", "highlight", 4.5],
  ["destructive", "background", 4.5],
  ["destructive", "card", 4.5],
  ["sidebar-foreground", "sidebar", 7],
  ["ring", "background", 3],
]

function linearRgb([L, C, H]) {
  const h = (H * Math.PI) / 180
  const a = C * Math.cos(h)
  const b = C * Math.sin(h)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((v) => Math.min(1, Math.max(0, v)))
}

const luminance = (color) => {
  const [r, g, b] = linearRgb(color)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const contrast = (x, y) => {
  const [hi, lo] = [luminance(x), luminance(y)].sort((p, q) => q - p)
  return (hi + 0.05) / (lo + 0.05)
}

let failures = 0
let blocks = 0

for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  if (!/--background:\s*oklch/.test(body)) continue
  blocks++
  const tokens = {}
  for (const [, name, values] of body.matchAll(
    /--([\w-]+):\s*oklch\(([^)]*)\)/g
  )) {
    tokens[name] = values.split("/")[0].trim().split(/\s+/).map(Number)
  }
  const label = selector
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .trim()
  for (const [fg, bg, min] of PAIRS) {
    if (!tokens[fg] || !tokens[bg]) continue
    const ratio = contrast(tokens[fg], tokens[bg])
    if (ratio < min) {
      failures++
      console.log(
        `FAIL ${ratio.toFixed(2)} < ${min}  ${fg} on ${bg}  (${label})`
      )
    }
  }
}

console.log(`Checked ${blocks} palette blocks: ${failures} failing pair(s).`)
process.exit(failures ? 1 : 0)
