import { parseIngredient } from "./parse.ts"

/** An ingredient or step with the section it's in: "For the sauce", or none. */
export type SectionedItem = { section: string | null; text: string }

/**
 * Splits lines, as typed in the editor, into items with their section. A
 * line starting with "#" starts a section. With `colonHeadings`, so does a
 * short line ending in ":" with no amount ("For the sauce:"), as pasted
 * recipes often have.
 */
export function splitSections(
  lines: readonly string[],
  { colonHeadings = false } = {}
): SectionedItem[] {
  const items: SectionedItem[] = []
  let section: string | null = null
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith("#")) {
      section = line.replace(/^#+/, "").trim().replace(/:$/, "") || null
      continue
    }
    if (
      colonHeadings &&
      line.endsWith(":") &&
      line.length <= 60 &&
      parseIngredient(line).quantity === null
    ) {
      section = line.slice(0, -1).trim() || null
      continue
    }
    items.push({ section, text: line })
  }
  return items
}

/**
 * The other way: items back to editor lines, with "# Section" headings. A
 * bare "#" ends a section, for items after it that have none.
 */
export function joinSections(items: readonly SectionedItem[]): string[] {
  const lines: string[] = []
  let section: string | null = null
  for (const item of items) {
    if (item.section !== section) {
      lines.push(item.section ? `# ${item.section}` : "#")
      section = item.section
    }
    lines.push(item.text)
  }
  return lines
}
