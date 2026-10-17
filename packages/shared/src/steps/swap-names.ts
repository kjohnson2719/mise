// A step that follows a swap: where it names the ingredient swapped out, it
// names the stand-in. "Stir in the tomato paste" becomes "Stir in the
// tomato sauce". Another ingredient's name is left alone: swapping the
// butter doesn't touch "peanut butter".

/** A name's forms: as given, singular and plural. */
function forms(name: string) {
  const base = name.trim().toLowerCase().replace(/\s+/g, " ")
  if (!base) return []
  const all = new Set([base])
  if (base.endsWith("ies")) all.add(`${base.slice(0, -3)}y`)
  else if (/(oes|ches|shes|xes|sses)$/.test(base)) all.add(base.slice(0, -2))
  else if (base.endsWith("s") && !base.endsWith("ss"))
    all.add(base.slice(0, -1))
  else {
    all.add(`${base}s`)
    if (base.endsWith("y")) all.add(`${base.slice(0, -1)}ies`)
    if (/(o|ch|sh|x)$/.test(base)) all.add(`${base}es`)
  }
  return [...all]
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** Where a name and its forms are in some text, whole words only. */
function findAll(text: string, names: readonly string[]) {
  const words = names
    .flatMap(forms)
    .sort((a, b) => b.length - a.length)
    .map((word) => escape(word).replace(/ /g, "\\s+"))
  if (words.length === 0) return []
  const pattern = new RegExp(`\\b(?:${words.join("|")})\\b`, "gi")
  return [...text.matchAll(pattern)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
    text: match[0],
  }))
}

/**
 * A step with the food swapped out named as its stand-in. It looks for the
 * food's whole name first ("tomato paste"), then its last word ("paste"),
 * but never inside another ingredient's name in the step. Says whether it
 * changed anything.
 */
export function swapNames(
  step: string,
  swap: {
    /** The food swapped out: "tomato paste". */
    from: string
    /** What stands in for it: "tomato sauce". */
    to: string
    /** The recipe's other foods, which keep their names. */
    others?: readonly string[]
  }
) {
  const from = swap.from.trim().toLowerCase()
  const words = from.split(" ")
  const names = words.length > 1 ? [from, words.at(-1)!] : [from]
  const kept = findAll(
    step,
    (swap.others ?? []).filter((other) => {
      const name = other.trim().toLowerCase()
      return name && name !== from && names.some((n) => name.includes(n))
    })
  )
  let text = ""
  let at = 0
  let swapped = false
  for (const match of findAll(step, names)) {
    if (match.start < at) continue
    const inside = kept.some(
      (other) => match.start < other.end && match.end > other.start
    )
    if (inside) continue
    const to =
      match.text[0] === match.text[0]!.toUpperCase()
        ? swap.to[0]!.toUpperCase() + swap.to.slice(1)
        : swap.to
    text += step.slice(at, match.start) + to
    at = match.end
    swapped = true
  }
  return { text: text + step.slice(at), swapped }
}
