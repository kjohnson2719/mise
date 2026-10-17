/** The diet labels a recipe can have, worked out from its ingredients. */
export const DIETS = [
  "vegetarian",
  "vegan",
  "gluten-free",
  "dairy-free",
  "egg-free",
  "nut-free",
] as const
export type Diet = (typeof DIETS)[number]

/** A household's corrections to what the ingredients suggest. */
export type DietOverrides = Partial<Record<Diet, boolean>>

type Group = "meat" | "fish" | "dairy" | "egg" | "gluten" | "nuts" | "honey"

/** What each group looks for in a line, and the phrases that don't count. */
type GroupWords = Record<Group, { has: RegExp; unless?: RegExp }>

/** A qualifier and the word or two it applies to: "vegan mayo", "gluten-free oats". */
const AND_NEXT = String.raw`(?:\s+[\w-]+){1,2}`

/**
 * English. The phrases that don't count ("vegetable broth" isn't meat,
 * "corn tortillas" aren't gluten) are taken out before looking, so
 * "vegetable broth and chicken" still has chicken. Cautious on purpose: a
 * recipe only gets a label when nothing looks like it breaks it, so plain
 * "stock" counts as meat and "soy sauce" as gluten.
 */
const ENGLISH: GroupWords = {
  meat: {
    has: /\b(beef|steaks?|pork|bacon|ham|hocks?|prosciutto|pancetta|guanciale|sausages?|chorizo|salami|pepperoni|kielbasa|hot ?dogs?|lamb|mutton|veal|venison|bison|goat meat|chicken|turkey|duck|goose|quail|meat|meatballs?|mince|ribs|brisket|oxtail|liver|giblets?|lard|suet|gelatin|gelatine|broth|stock|bouillon|drippings|pâté|pate)\b/,
    unless: new RegExp(
      String.raw`\b(?:vegetable|veggie|mushroom|vegan|vegetarian|plant[- ]based|meatless|meat[- ]free|imitation)${AND_NEXT}`
    ),
  },
  fish: {
    has: /\b(fish|salmon|tuna|cod|tilapia|halibut|trout|haddock|snapper|sea bass|sardines?|anchov(y|ies)|mackerel|herring|shrimp|prawns?|crab|lobster|scallops?|clams?|mussels?|oysters?|squid|calamari|octopus|crawfish|crayfish|bonito|dashi|caviar|roe|worcestershire|surimi)\b/,
    unless: new RegExp(
      String.raw`\b(?:vegan|vegetarian|plant[- ]based|fish[- ]free)${AND_NEXT}`
    ),
  },
  dairy: {
    has: /\b(milk|butter|buttermilk|ghee|cheeses?|parmesan|parmigiano|pecorino|cheddar|mozzarella|burrata|ricotta|feta|gouda|brie|camembert|gruy[eè]re|emmental|swiss cheese|provolone|monterey jack|colby|havarti|asiago|manchego|mascarpone|paneer|halloumi|queso|cotija|cream|cr[eè]me fra[iî]che|yogh?urt|kefir|whey|casein|ice cream|custard|alfredo|ranch|pesto|tzatziki|labneh)\b/,
    unless: new RegExp(
      String.raw`\b(?:coconut|almond|oat|soy|soya|rice|cashew|hemp|pea|peanut|nut|sunflower|seed|apple|pumpkin|cocoa|shea)\s+(?:milk|butter|cream|creamer|yogh?urt|cheese)\b|\b(?:vegan|non[- ]?dairy|dairy[- ]free|plant[- ]based)${AND_NEXT}|\b(?:butter beans?|butter lettuce|cream of tartar)\b`
    ),
  },
  egg: {
    has: /\b(eggs?|yolks?|egg whites?|mayonnaise|mayo|aioli|meringue|custard|hollandaise)\b/,
    unless: new RegExp(
      String.raw`\b(?:vegan|eggless|egg[- ]free)${AND_NEXT}|\b(?:egg replacer|flax eggs?|chia eggs?)\b`
    ),
  },
  gluten: {
    has: /\b(flour|wheat|bread|breads|breadcrumbs?|bread crumbs|panko|croutons?|pasta|spaghetti|linguine|fettuccine|penne|rigatoni|macaroni|lasagna|lasagne|orzo|ravioli|tortellini|gnocchi|noodles?|ramen|udon|couscous|bulgur|farro|freekeh|barley|rye|spelt|semolina|durum|seitan|malt|beer|ale|lager|stout|soy sauce|shoyu|teriyaki|hoisin|tortillas?|pita|naan|bagels?|buns?|rolls|biscuits?|crackers?|graham|pie crust|pastry|puff pastry|phyllo|filo|wonton|dumplings?|oats|oatmeal|granola|cereal|cookies?|cake mix|brownie mix|pretzels?|stuffing)\b/,
    unless: new RegExp(
      String.raw`\b(?:gluten[- ]free|gf)${AND_NEXT}|\b(?:rice|almond|coconut|chickpea|garbanzo|corn|cassava|tapioca|potato|sorghum|buckwheat|teff|millet|quinoa|arrowroot)\s+(?:flour|starch|meal)\b|\b(?:rice|glass|bean thread|kelp|shirataki|zucchini)\s+noodles?\b|\b(?:chickpea|lentil|rice|bean)\s+pasta\b|\bcorn\s+tortillas?\b|\b(?:rice crackers?|tamari|lettuce wraps?|cornstarch)\b`
    ),
  },
  nuts: {
    has: /\b(nuts?|almonds?|walnuts?|pecans?|cashews?|pistachios?|hazelnuts?|filberts?|macadamias?|brazil nuts?|pine nuts?|pignoli|peanuts?|chestnuts?|nutella|praline|marzipan|frangipane|nougat|pesto|satay|gianduja)\b/,
    unless: new RegExp(
      String.raw`\b(?:water chestnuts?|tiger nuts?)\b|\bnut[- ]free${AND_NEXT}`
    ),
  },
  honey: { has: /\bhoney\b/, unless: /\bvegan honey\b/ },
}

/** Ingredient words by language. A language recipes are written in adds its own. */
const LANGUAGES: Record<string, GroupWords> = { en: ENGLISH }

/** What rules each diet out. */
const BREAKS: Record<Diet, Group[]> = {
  vegetarian: ["meat", "fish"],
  vegan: ["meat", "fish", "dairy", "egg", "honey"],
  "gluten-free": ["gluten"],
  "dairy-free": ["dairy"],
  "egg-free": ["egg"],
  "nut-free": ["nuts"],
}

/** Groups an ingredient line falls into. */
function groupsOf(line: string, words: GroupWords): Set<Group> {
  const text = line.toLowerCase()
  const found = new Set<Group>()
  for (const [group, { has, unless }] of Object.entries(words) as [
    Group,
    GroupWords[Group],
  ][]) {
    // A clearing phrase only clears itself: "butternut squash and butter"
    // still has butter.
    const cleared = unless ? text.replace(new RegExp(unless, "g"), " ") : text
    if (has.test(cleared)) found.add(group)
  }
  return found
}

const wordsFor = (language: string) =>
  LANGUAGES[language.toLowerCase().split(/[-_]/)[0]!] ?? ENGLISH

/** For each diet, the ingredient lines that rule it out ("2 tbsp butter"). */
export function dietConflicts(
  ingredients: readonly string[],
  language = "en"
): Record<Diet, string[]> {
  const words = wordsFor(language)
  const lines = ingredients.map((line) => line.trim()).filter(Boolean)
  const groups = lines.map((line) => groupsOf(line, words))
  return Object.fromEntries(
    DIETS.map((diet) => [
      diet,
      lines.filter((_, i) => BREAKS[diet].some((g) => groups[i]!.has(g))),
    ])
  ) as Record<Diet, string[]>
}

/**
 * Whether the words are ones Merran can read for diets and allergies: the
 * Latin alphabet, for now. Most lines in another script (a recipe kept in
 * Arabic, say) say nothing either way.
 */
export function canRead(lines: readonly string[]) {
  const written = lines.filter((line) => /\p{L}/u.test(line))
  const latin = written.filter((line) => /\p{Script=Latin}{2}/u.test(line))
  return latin.length * 2 >= written.length
}

/**
 * Diet labels that fit, judging by the ingredients alone: only those with
 * nothing against them. A recipe without ingredients gets none, and so
 * does one whose words can't be read.
 */
export function dietsFor(ingredients: readonly string[], language = "en") {
  if (!ingredients.some((line) => line.trim())) return []
  if (!canRead(ingredients)) return []
  const conflicts = dietConflicts(ingredients, language)
  return DIETS.filter((diet) => conflicts[diet].length === 0)
}

/** What the ingredients suggest, with the household's corrections on top. */
export function applyDietOverrides(
  suggested: readonly Diet[],
  overrides: DietOverrides
): Diet[] {
  return DIETS.filter((diet) => overrides[diet] ?? suggested.includes(diet))
}

/** Only the corrections that differ from what the ingredients suggest. */
export function keptOverrides(
  suggested: readonly Diet[],
  overrides: DietOverrides
): DietOverrides {
  const kept: DietOverrides = {}
  for (const diet of DIETS) {
    const value = overrides[diet]
    if (value !== undefined && value !== suggested.includes(diet)) {
      kept[diet] = value
    }
  }
  return kept
}
