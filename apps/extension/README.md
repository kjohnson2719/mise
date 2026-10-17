# Merran browser extension

Add recipes to Merran from the page you're on, even on sites that turn Merran's server away or only show a recipe to someone signed in, and keep the shopping list beside you while you shop. Built with [WXT](https://wxt.dev) for Chrome, Edge and Firefox from the same code.

## What it does

- **The toolbar button:** connects to your Merran, then adds the recipe on the page you're on. A page with recipe data goes straight in; one without is read by your household's AI, if it has AI.
- **Right-click:** a page or a link to add its recipe, or selected text to add it to the shopping list ("2 lemons, a bag of rice").
- **The shopping list beside the page:** Chrome and Edge's side panel, Firefox's sidebar. Find each thing at one of your stores (pick which at the top), check things off as they go in the cart, and add what's missing.
- **Filling a Walmart cart** (experimental, when the server admin has turned Walmart on): Merran's Walmart page asks the extension to find each thing and add it to the cart in a Walmart tab of your own, one page at a time. It stops whenever Walmart asks whether you're a person, for you to finish in the tab, and checking out is always yours. It asks once to work on walmart.com, from a page of its own.

## Connecting

The toolbar button asks for your Merran's address. The browser asks to let the extension reach it, then Merran opens `/extension/connect`, asks you, and makes a key with just what the extension needs (add recipes, see the plan, keep the list), which it hands to the extension: nothing to copy. The key shows in Merran under Settings, You, API keys, where it can be taken away.

Once connected, the extension listens on that Merran's pages (and only those): its **bridge** (`src/entrypoints/merran.content.ts`) tells Merran's pages it's there and does what they ask, such as filling the Walmart cart (`src/lib/walmart.ts`). The pages never see its key.

## Building it

From the repository's root:

```bash
pnpm --filter @merran/extension build
```

Then in Chrome or Edge, open `chrome://extensions`, turn on **Developer mode**, choose **Load unpacked**, and pick `apps/extension/.output/chrome-mv3`. For Firefox, build with `build:firefox` and load `apps/extension/.output/firefox-mv3/manifest.json` from `about:debugging`.

- `pnpm --filter @merran/extension watch` builds as you change it, in a browser of its own.
- `pnpm --filter @merran/extension zip` makes the zips for the stores.
- `pnpm --filter @merran/extension api` makes `src/lib/schema.d.ts` again from the server's OpenAPI spec, after the API changes.
