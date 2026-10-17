export type UnitKind = "volume" | "weight" | "count"

export type Unit = {
  id: string
  name: string
  pluralName: string
  abbreviation: string | null
  aliases: string[]
  kind: UnitKind
  /** Millilitres per unit for a volume, grams per unit for a weight, null for a count. */
  toBase: number | null
}

// US customary volumes use US measures: 1 cup is 236.588 ml.
export const UNITS: Unit[] = [
  {
    id: "teaspoon",
    name: "teaspoon",
    pluralName: "teaspoons",
    abbreviation: "tsp",
    aliases: ["t", "tsp.", "tsps", "tspn"],
    kind: "volume",
    toBase: 4.92892,
  },
  {
    id: "tablespoon",
    name: "tablespoon",
    pluralName: "tablespoons",
    abbreviation: "tbsp",
    aliases: ["T", "tbs", "tbl", "tbsp.", "tbsps", "tblsp"],
    kind: "volume",
    toBase: 14.7868,
  },
  {
    id: "fluid-ounce",
    name: "fluid ounce",
    pluralName: "fluid ounces",
    abbreviation: "fl oz",
    aliases: ["fl. oz.", "fl oz.", "floz"],
    kind: "volume",
    toBase: 29.5735,
  },
  {
    id: "cup",
    name: "cup",
    pluralName: "cups",
    abbreviation: "c",
    aliases: ["c.", "C"],
    kind: "volume",
    toBase: 236.588,
  },
  {
    id: "pint",
    name: "pint",
    pluralName: "pints",
    abbreviation: "pt",
    aliases: ["pt."],
    kind: "volume",
    toBase: 473.176,
  },
  {
    id: "quart",
    name: "quart",
    pluralName: "quarts",
    abbreviation: "qt",
    aliases: ["qt."],
    kind: "volume",
    toBase: 946.353,
  },
  {
    id: "gallon",
    name: "gallon",
    pluralName: "gallons",
    abbreviation: "gal",
    aliases: ["gal."],
    kind: "volume",
    toBase: 3785.41,
  },
  {
    id: "milliliter",
    name: "milliliter",
    pluralName: "milliliters",
    abbreviation: "ml",
    aliases: ["mL", "millilitre", "millilitres", "mls"],
    kind: "volume",
    toBase: 1,
  },
  {
    id: "liter",
    name: "liter",
    pluralName: "liters",
    abbreviation: "l",
    aliases: ["L", "litre", "litres"],
    kind: "volume",
    toBase: 1000,
  },
  {
    id: "gram",
    name: "gram",
    pluralName: "grams",
    abbreviation: "g",
    aliases: ["gr", "gm", "gms", "grammes"],
    kind: "weight",
    toBase: 1,
  },
  {
    id: "kilogram",
    name: "kilogram",
    pluralName: "kilograms",
    abbreviation: "kg",
    aliases: ["kgs", "kilo", "kilos"],
    kind: "weight",
    toBase: 1000,
  },
  {
    id: "ounce",
    name: "ounce",
    pluralName: "ounces",
    abbreviation: "oz",
    aliases: ["oz."],
    kind: "weight",
    toBase: 28.3495,
  },
  {
    id: "pound",
    name: "pound",
    pluralName: "pounds",
    abbreviation: "lb",
    aliases: ["lbs", "lb.", "lbs."],
    kind: "weight",
    toBase: 453.592,
  },
  ...[
    ["pinch", "pinches"],
    ["dash", "dashes"],
    ["drop", "drops"],
    ["clove", "cloves"],
    ["can", "cans"],
    ["jar", "jars"],
    ["box", "boxes"],
    ["bag", "bags"],
    ["bottle", "bottles"],
    ["container", "containers"],
    ["carton", "cartons"],
    ["tub", "tubs"],
    ["envelope", "envelopes"],
    ["block", "blocks"],
    ["loaf", "loaves"],
    ["sleeve", "sleeves"],
    ["sheet", "sheets"],
    ["stick", "sticks"],
    ["slice", "slices"],
    ["bunch", "bunches"],
    ["sprig", "sprigs"],
    ["head", "heads"],
    ["handful", "handfuls"],
  ].map(([name, pluralName]): Unit => ({
    id: name!,
    name: name!,
    pluralName: pluralName!,
    abbreviation: null,
    aliases: [],
    kind: "count",
    toBase: null,
  })),
  {
    id: "package",
    name: "package",
    pluralName: "packages",
    abbreviation: "pkg",
    aliases: ["pkgs", "packet", "packets"],
    kind: "count",
    toBase: null,
  },
  {
    id: "piece",
    name: "piece",
    pluralName: "pieces",
    abbreviation: "pc",
    aliases: ["pcs"],
    kind: "count",
    toBase: null,
  },
]

export const UNITS_BY_ID: ReadonlyMap<string, Unit> = new Map(
  UNITS.map((unit) => [unit.id, unit])
)

export const METRIC_UNIT_IDS: ReadonlySet<string> = new Set([
  "milliliter",
  "liter",
  "gram",
  "kilogram",
])

/** Spoons are measured the same way the world over, so they're left as written. */
export const SPOON_UNIT_IDS: ReadonlySet<string> = new Set([
  "teaspoon",
  "tablespoon",
])
