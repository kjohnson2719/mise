import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [
    // Must come before React: it writes src/routeTree.gen.ts from src/routes.
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: { "@": resolve(import.meta.dirname, "./src") },
  },
  server: {
    // The API runs on its own in development (apps/server on :3000).
    // xfwd keeps the browser's address, so links the API makes (invite
    // links) point back here.
    proxy: { "/api": { target: "http://localhost:3000", xfwd: true } },
  },
})
