import { defineConfig } from "wxt"

// The Merran browser extension, built by WXT for Chrome, Edge and Firefox
// from the same code (docs/stack.md, "WXT for the extension").

export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-react"],
  // Manifest V3 everywhere, Firefox included, so there's one way to do things.
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: "Merran",
    description:
      "Import recipes into your Merran from any page, and keep the shopping list beside you while you shop.",
    icons: {
      16: "icons/16.png",
      32: "icons/32.png",
      48: "icons/48.png",
      96: "icons/96.png",
      128: "icons/128.png",
    },
    action: { default_title: "Merran" },
    permissions: [
      "activeTab",
      "scripting",
      "storage",
      "contextMenus",
      ...(browser === "firefox" ? [] : ["sidePanel"]),
    ],
    // Only the address of the person's own Merran, asked for when they connect.
    optional_host_permissions: ["https://*/*", "http://*/*"],
    ...(browser === "firefox"
      ? {
          browser_specific_settings: {
            gecko: { id: "extension@merran.app", strict_min_version: "128.0" },
          },
        }
      : {}),
  }),
})
