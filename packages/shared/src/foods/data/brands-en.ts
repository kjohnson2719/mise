import type { FoodBrands } from "../vocabulary.ts"

// Brands in English recipes and store names. Most are dropped before
// looking for the food ("King Arthur Unbleached All-Purpose Flour" is
// all-purpose flour); a few name the food themselves ("Diamond Crystal" is
// salt). A brand that is the product (Sriracha, Old Bay) is a food instead.

export const BRANDS_EN: FoodBrands = {
  drop: [
    "365",
    "barilla",
    "bob's red mill",
    "c&h",
    "cabot",
    "de cecco",
    "domino",
    "ghirardelli",
    "gold medal",
    "goya",
    "great value",
    "guittard",
    "heinz",
    "hellmann's",
    "imagine",
    "kerrygold",
    "king arthur",
    "kirkland",
    "kitchen basics",
    "kraft",
    "kroger",
    "la costeña",
    "land o lakes",
    "mccormick",
    "morton",
    "muir glen",
    "mutti",
    "nestlé toll house",
    "nestle toll house",
    "pacific",
    "pillsbury",
    "private selection",
    "rao's",
    "red star",
    "simple truth",
    "spice islands",
    "swanson",
    "tillamook",
    "trader joe's",
    "whole foods",
  ],
  means: {
    "diamond crystal": "kosher salt",
    // Denser than Diamond Crystal, so a cup weighs more.
    "morton kosher salt": "morton kosher salt",
    maldon: "flaky sea salt",
    "better than bouillon": "chicken bouillon",
  },
}
