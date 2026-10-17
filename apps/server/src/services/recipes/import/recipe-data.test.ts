import { describe, expect, test } from "vitest"
import {
  cleanText,
  parseDuration,
  parseYield,
  readRecipeData,
} from "./recipe-data.ts"

function page(...blocks: unknown[]) {
  const scripts = blocks
    .map(
      (block) =>
        `<script type="application/ld+json">${typeof block === "string" ? block : JSON.stringify(block)}</script>`
    )
    .join("\n")
  return `<!doctype html><html><head>${scripts}</head><body><h1>Hi</h1></body></html>`
}

// Shaped like WordPress Recipe Maker, which a lot of food blogs use.
const WPRM = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", name: "Some Blog" },
    { "@type": "WebPage", "@id": "https://blog.example/#webpage" },
    {
      "@type": "Recipe",
      name: "Mom&#39;s Chicken &amp; Rice",
      description: "<p>Cozy, <strong>one-pan</strong> dinner.</p>",
      image: [
        { "@type": "ImageObject", url: "/wp-content/uploads/chicken.jpg" },
      ],
      recipeYield: ["4", "4 servings"],
      prepTime: "PT15M",
      cookTime: "PT45M",
      totalTime: "PT1H",
      recipeCategory: ["Main Course"],
      recipeCuisine: "American",
      keywords: "chicken, rice, one pan, Chicken, web",
      recipeIngredient: [
        "1 ½ lb chicken thighs",
        "1 cup long-grain rice",
        "2&nbsp;cups chicken stock",
      ],
      recipeInstructions: [
        {
          "@type": "HowToSection",
          name: "Prep",
          itemListElement: [
            { "@type": "HowToStep", text: "Season the chicken." },
          ],
        },
        {
          "@type": "HowToSection",
          name: "Cook",
          itemListElement: [
            { "@type": "HowToStep", text: "Brown the chicken." },
            { "@type": "HowToStep", text: "Add rice &amp; stock; simmer." },
          ],
        },
      ],
    },
  ],
}

describe("recipe data", () => {
  test("is read out of an @graph, with sections", () => {
    const result = readRecipeData(
      page(WPRM),
      "https://blog.example/chicken-rice/"
    )
    expect(result).not.toBeNull()
    const { input, photoUrls } = result!
    expect(input).toMatchObject({
      name: "Mom's Chicken & Rice",
      description: "Cozy, one-pan dinner.",
      servings: 4,
      yieldText: null,
      prepMinutes: 15,
      cookMinutes: 45,
      totalMinutes: 60,
      sourceUrl: "https://blog.example/chicken-rice/",
      // From the category and cuisine; its keywords are left out.
      tags: ["Main Course", "American"],
    })
    expect(input.ingredients).toEqual([
      "1 ½ lb chicken thighs",
      "1 cup long-grain rice",
      "2 cups chicken stock",
    ])
    expect(input.steps).toEqual([
      "# Prep",
      "Season the chicken.",
      "# Cook",
      "Brown the chicken.",
      "Add rice & stock; simmer.",
    ])
    expect(photoUrls).toEqual([
      "https://blog.example/wp-content/uploads/chicken.jpg",
    ])
  })

  test("can have plain string steps and a yield with a unit", () => {
    const result = readRecipeData(
      page({
        "@context": "https://schema.org",
        "@type": ["Recipe"],
        name: "Chocolate Chip Cookies",
        recipeYield: "24 cookies",
        cookTime: "PT10M",
        prepTime: "PT20M",
        image: "https://cdn.example/cookies.jpg",
        recipeIngredient: ["2 cups flour", "1 cup chocolate chips"],
        recipeInstructions: "Mix everything.\nScoop onto a sheet.\n\nBake.",
      }),
      "https://example.com/cookies"
    )!
    expect(result.input).toMatchObject({
      servings: 24,
      yieldText: "24 cookies",
      totalMinutes: null,
      steps: ["Mix everything.", "Scoop onto a sheet.", "Bake."],
    })
    expect(result.photoUrls).toEqual(["https://cdn.example/cookies.jpg"])
  })

  test("drops a leading Makes or Yield from what it makes", () => {
    // A bare number is how many it serves, as "12" alone would be.
    expect(parseYield("Makes 12")).toEqual({ servings: 12, yieldText: null })
    expect(parseYield("Yield: 2 loaves")).toEqual({
      servings: 2,
      yieldText: "2 loaves",
    })
    expect(parseYield("Serves 4")).toEqual({ servings: 4, yieldText: null })
  })

  test("gives tags from several categories in one string, capitalized", () => {
    const result = readRecipeData(
      page({
        "@type": "Recipe",
        name: "Easy pancakes",
        recipeCategory: "breakfast, brunch, Breakfast",
        recipeCuisine: "british",
        keywords: "cassie best, flip, flipping",
        recipeIngredient: ["100g plain flour"],
      }),
      "https://example.com/pancakes"
    )!
    expect(result.input.tags).toEqual(["Breakfast", "Brunch", "British"])
  })

  test("is found among other blocks, trailing commas and all", () => {
    const result = readRecipeData(
      page(
        { "@type": "BreadcrumbList", itemListElement: [] },
        `{"@type": "Recipe", "name": "Toast", "recipeIngredient": ["1 slice bread",], "recipeInstructions": ["Toast it."],}`
      ),
      "https://example.com/toast"
    )
    expect(result?.input.name).toBe("Toast")
    expect(result?.input.ingredients).toEqual(["1 slice bread"])
  })

  test("is null for a page without a recipe", () => {
    expect(
      readRecipeData(
        page({ "@type": "Article", name: "Ten kitchen tips" }),
        "https://example.com/"
      )
    ).toBeNull()
    expect(
      readRecipeData(
        "<html><body>Nothing</body></html>",
        "https://example.com/"
      )
    ).toBeNull()
  })
})

describe("recipe photos", () => {
  const recipe = {
    "@type": "Recipe",
    name: "Soup",
    recipeIngredient: ["1 onion"],
  }

  test("follow a reference to the page's ImageObject", () => {
    const result = readRecipeData(
      page({
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "ImageObject",
            "@id": "https://blog.example/soup/#primaryimage",
            url: "https://blog.example/uploads/soup.jpg",
            width: 1200,
            height: 800,
          },
          {
            ...recipe,
            image: { "@id": "https://blog.example/soup/#primaryimage" },
          },
        ],
      }),
      "https://blog.example/soup/"
    )!
    expect(result.photoUrls).toEqual(["https://blog.example/uploads/soup.jpg"])
  })

  test("are tried big ones first, then unknown sizes, then small ones", () => {
    const result = readRecipeData(
      page({
        ...recipe,
        image: [
          "https://blog.example/uploads/soup-150x150.jpg",
          "https://blog.example/uploads/soup-500x500.jpg",
          "https://blog.example/uploads/soup-1200x800.jpg",
          "https://blog.example/uploads/soup.jpg",
        ],
      }),
      "https://blog.example/soup/"
    )!
    expect(result.photoUrls).toEqual([
      "https://blog.example/uploads/soup-1200x800.jpg",
      "https://blog.example/uploads/soup.jpg",
      "https://blog.example/uploads/soup-500x500.jpg",
      "https://blog.example/uploads/soup-150x150.jpg",
    ])
  })

  test("have their sizes read from resize links", () => {
    const result = readRecipeData(
      page({
        ...recipe,
        image: [
          "https://blog.example/tachyon/soup.jpg?fit=225%2C225",
          "https://blog.example/tachyon/soup.jpg?resize=1200%2C900",
        ],
      }),
      "https://blog.example/soup/"
    )!
    // The small copy's original goes before the small copy.
    expect(result.photoUrls).toEqual([
      "https://blog.example/tachyon/soup.jpg?resize=1200%2C900",
      "https://blog.example/tachyon/soup.jpg",
      "https://blog.example/tachyon/soup.jpg?fit=225%2C225",
    ])
  })

  test("fall back to the page's share image", () => {
    const html = page(recipe).replace(
      "<head>",
      '<head><meta property="og:image" content="/share/soup.jpg">'
    )
    const result = readRecipeData(html, "https://blog.example/soup/")!
    expect(result.photoUrls).toEqual(["https://blog.example/share/soup.jpg"])
  })
})

describe("durations", () => {
  test.each([
    ["PT1H30M", 90],
    ["PT45M", 45],
    ["P0DT0H20M", 20],
    ["PT90S", 2],
    ["P1D", 1440],
    ["PT0M", null],
    ["20 minutes", null],
    [undefined, null],
  ])("%s is %s minutes", (value, expected) => {
    expect(parseDuration(value)).toBe(expected)
  })
})

test("text is decoded, tags dropped and spaces collapsed", () => {
  expect(cleanText("  Salt &amp; <em>pepper</em>\n\n to taste ")).toBe(
    "Salt & pepper to taste"
  )
  expect(cleanText(12)).toBe("12")
  expect(cleanText(null)).toBe("")
})
