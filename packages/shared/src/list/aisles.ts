import { foodFacts, knownKey } from "../foods/vocabulary.ts"
import { foodInLine, plainKey } from "./food.ts"

// Aisles, in a typical walk through the store. Each household starts with
// its country's names for them, and food is sorted into them by a first
// guess until someone moves it, which the household remembers.

export const AISLE_KEYS = [
  "produce",
  "bakery",
  "meat-seafood",
  "deli",
  "dairy-eggs",
  "pantry",
  "canned-jarred",
  "spices",
  "condiments",
  "international",
  "frozen",
  "snacks",
  "beverages",
  "household",
  "other",
] as const
export type AisleKey = (typeof AISLE_KEYS)[number]

type AisleNames = Record<AisleKey, string>

const NORTH_AMERICA: AisleNames = {
  produce: "Produce",
  bakery: "Bakery",
  "meat-seafood": "Meat & seafood",
  deli: "Deli",
  "dairy-eggs": "Dairy & eggs",
  pantry: "Pantry",
  "canned-jarred": "Canned & jarred",
  spices: "Spices & seasonings",
  condiments: "Condiments & sauces",
  international: "International",
  frozen: "Frozen",
  snacks: "Snacks",
  beverages: "Beverages",
  household: "Household",
  other: "Other",
}

const BRITAIN: AisleNames = {
  produce: "Fruit & veg",
  bakery: "Bakery",
  "meat-seafood": "Meat & fish",
  deli: "Deli",
  "dairy-eggs": "Dairy & eggs",
  pantry: "Food cupboard",
  "canned-jarred": "Tins & jars",
  spices: "Herbs & spices",
  condiments: "Sauces & condiments",
  international: "World foods",
  frozen: "Frozen",
  snacks: "Crisps & snacks",
  beverages: "Drinks",
  household: "Household",
  other: "Other",
}

const AUSTRALIA: AisleNames = {
  produce: "Fruit & veg",
  bakery: "Bakery",
  "meat-seafood": "Meat & seafood",
  deli: "Deli",
  "dairy-eggs": "Dairy & eggs",
  pantry: "Pantry",
  "canned-jarred": "Tins & jars",
  spices: "Herbs & spices",
  condiments: "Sauces & condiments",
  international: "International",
  frozen: "Freezer",
  snacks: "Snacks",
  beverages: "Drinks",
  household: "Household",
  other: "Other",
}

/** Countries with their own aisle names; anywhere else gets the general ones. */
const BY_COUNTRY: Record<string, AisleNames> = {
  US: NORTH_AMERICA,
  CA: NORTH_AMERICA,
  GB: BRITAIN,
  IE: BRITAIN,
  AU: AUSTRALIA,
  NZ: AUSTRALIA,
}

/** A country's aisles in walking order: "GB" has Fruit & veg and Tins & jars. */
export function aislesFor(country: string | null | undefined) {
  const names = BY_COUNTRY[country?.toUpperCase() ?? ""] ?? NORTH_AMERICA
  return AISLE_KEYS.map((key) => ({ key, name: names[key] }))
}

/** Words for a first guess at the aisle of a food Merran doesn't know, tried in order. */
const AISLE_WORDS: [AisleKey, RegExp][] = [
  // Before produce: potato chips are a snack.
  ["snacks", /\b(potato chip|potato crisp|crisps)\b/],
  // Before spices: bell peppers are produce, though "pepper" is a spice.
  [
    "produce",
    /\b(bell|sweet|red|green|yellow|orange|jalape[nñ]o|poblano|serrano|banana|chil[ei]) peppers?\b(?! flakes?)/,
  ],
  [
    "spices",
    /\b(salt|pepper(corns?)?|paprika|cumin|cinnamon|nutmeg|oregano|dried \w+|chili powder|chilli powder|cayenne|turmeric|curry powder|garam masala|garlic powder|onion powder|bay leaf|bay leaves|seasoning|allspice|ground (cumin|cinnamon|ginger|nutmeg|coriander|cloves|cardamom|turmeric|mustard)|red pepper flakes|chilli flakes|vanilla|extract|stock cube|bouillon)\b/,
  ],
  // Before produce, meat and dairy: "chicken stock", "crushed tomatoes" and
  // "coconut milk" come in cans and cartons; "peanut butter" is a spread.
  [
    "canned-jarred",
    /\b(canned|tinned|can of|tin of|diced tomato|crushed tomato|chopped tomato|whole tomato|tomato paste|tomato puree|tomato sauce|passata|marinara|pasta sauce|black bean|kidney bean|pinto bean|cannellini|butter bean|refried bean|baked bean|chickpea|garbanzo|lentil|broth|stock|coconut milk|coconut cream|tuna|olives|pickle|salsa|jam)\b/,
  ],
  [
    "condiments",
    /\b(ketchup|mustard|mayo|mayonnaise|soy sauce|tamari|fish sauce|hot sauce|sriracha|vinegar|worcestershire|bbq sauce|barbecue sauce|dressing|honey|maple syrup|hoisin|oyster sauce|miso|tahini|peanut butter)\b/,
  ],
  [
    "international",
    /\b(curry paste|gochujang|kimchi|nori|rice paper|rice noodle|wonton|tortilla chip|taco shell|harissa)\b/,
  ],
  ["deli", /\b(deli|salami|prosciutto|pepperoni|pastrami|hummus|sliced ham)\b/],
  [
    "produce",
    /\b(onion|shallot|garlic|ginger|potato|sweet potato|carrot|celery|tomato|lettuce|spinach|kale|arugula|rocket|cabbage|broccoli|cauliflower|zucchini|courgette|eggplant|aubergine|squash|pumpkin|cucumber|capsicum|mushroom|avocado|lemon|lime|orange|apple|banana|berry|strawberry|blueberry|raspberry|blackberry|grape|pear|peach|mango|pineapple|cilantro|coriander|parsley|basil|mint|thyme|rosemary|dill|chive|scallion|spring onion|green onion|leek|asparagus|green bean|radish|beet|beetroot|parsnip|turnip|swede|fennel|bok choy|pak choi|sprout|watercress|herb|salad greens|salad leaves)\b/,
  ],
  [
    "meat-seafood",
    /\b(chicken|beef|steak|pork|bacon|sausage|ham|turkey|lamb|veal|mince|ground (beef|pork|turkey|chicken|lamb)|chorizo|salmon|tuna steak|cod|tilapia|haddock|shrimp|prawn|scallop|fish|crab|lobster|mussel|thigh|breast|drumstick|wing|ribs?|brisket|roast)\b/,
  ],
  [
    "dairy-eggs",
    /\b(milk|buttermilk|cream|half and half|half-and-half|butter|yogurt|yoghurt|cheese|cheddar|mozzarella|parmesan|feta|ricotta|halloumi|cream cheese|sour cream|creme fraiche|crème fraîche|egg)\b/,
  ],
  [
    "bakery",
    /\b(bread|baguette|bun|roll|tortilla|wrap|pita|naan|bagel|croissant|english muffin|crumpet)\b/,
  ],
  [
    "pantry",
    /\b(flour|sugar|baking soda|bicarbonate|baking powder|yeast|cornstarch|cornflour|oil|rice|pasta|spaghetti|penne|noodle|oats|quinoa|couscous|breadcrumb|panko|cereal|cocoa|chocolate chip|nut|almond|walnut|pecan|cashew|peanut|raisin|cornmeal|polenta)\b/,
  ],
  ["frozen", /\b(frozen|ice cream)\b/],
  [
    "snacks",
    /\b(chip|crisp|cracker|pretzel|popcorn|cookie|biscuit|granola bar)\b/,
  ],
  [
    "beverages",
    /\b(water|soda|pop|cola|pepsi|coke|sprite|juice|coffee|tea|beer|wine|seltzer|sparkling|lemonade|squash drink|energy drink)\b/,
  ],
  [
    "household",
    /\b(paper towel|kitchen roll|toilet paper|toilet roll|tissue|napkin|trash bag|bin bag|foil|plastic wrap|cling film|parchment|baking paper|soap|detergent|washing up|dish|sponge|battery|batteries|shampoo|toothpaste)\b/,
  ],
]

/**
 * A first guess at a food's aisle. Frozen is frozen whatever it is (ice
 * cream too), and bought by the can or jar is canned and jarred; else a
 * food Merran knows is where the vocabulary shelves it, and anything else
 * goes by its words.
 */
export function guessAisle(name: string, unit?: string | null): AisleKey {
  const text = name.toLowerCase()
  if (/\b(frozen|ice cream)\b/.test(text)) return "frozen"
  if (unit === "can" || unit === "jar") return "canned-jarred"
  // Read as a line is: "chicken stock or water" is chicken stock.
  const found = foodInLine(text)
  const known = found?.known ? knownKey(found.key) : undefined
  if (known) return foodFacts(known)!.aisle
  return aisleByWords(text)
}

/**
 * A first guess at the aisle of a food Merran doesn't know, by its words:
 * "paper towels" are household.
 */
export function aisleByWords(name: string): AisleKey {
  const text = name.toLowerCase()
  // The singular too: "paper towels" matches "paper towel".
  const forms = [text, plainKey(text)]
  for (const [aisle, words] of AISLE_WORDS) {
    if (forms.some((form) => words.test(form))) return aisle
  }
  return "other"
}
