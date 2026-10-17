import * as React from "react"

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** Some text with names in it marked: a stand-in named in a step. */
export function withMarks(text: string, names: readonly string[]) {
  const words = names.filter(Boolean).map(escape)
  if (words.length === 0) return [text]
  const pattern = new RegExp(`(${words.join("|")})`, "gi")
  return text.split(pattern).map((piece, i) =>
    i % 2 === 1 ? (
      <mark
        key={i}
        className="rounded-sm bg-primary/15 [box-decoration-break:clone] px-0.5 text-inherit"
      >
        {piece}
      </mark>
    ) : (
      <React.Fragment key={i}>{piece}</React.Fragment>
    )
  )
}
