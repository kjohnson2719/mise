export type Palette = "sage" | "paprika" | "castiron"

export type PaletteOption = {
  value: Palette
  /** Translation keys for the palette's name and description. */
  nameKey: string
  descriptionKey: string
  /** Fixed preview colors, so every option shows its own colors in the picker. */
  swatches: { background: string; primary: string; highlight: string }
}

// Keep in sync with the token blocks in src/index.css.
export const PALETTES: PaletteOption[] = [
  {
    value: "sage",
    nameKey: "theme.palettes.sage.name",
    descriptionKey: "theme.palettes.sage.description",
    swatches: {
      background: "#fdfaf4",
      primary: "#356844",
      highlight: "#ae532d",
    },
  },
  {
    value: "paprika",
    nameKey: "theme.palettes.paprika.name",
    descriptionKey: "theme.palettes.paprika.description",
    swatches: {
      background: "#fdf8f1",
      primary: "#be4806",
      highlight: "#6a7a31",
    },
  },
  {
    value: "castiron",
    nameKey: "theme.palettes.castiron.name",
    descriptionKey: "theme.palettes.castiron.description",
    swatches: {
      background: "#fbfaf7",
      primary: "#2d2823",
      highlight: "#edb333",
    },
  },
]

export const PALETTE_VALUES = PALETTES.map((p) => p.value)
export const DEFAULT_PALETTE: Palette = "sage"
