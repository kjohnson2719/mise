import { defineConfig } from "vitest/config"

// Every test runs on SQLite. `pnpm test:all` runs them on Postgres too, against
// the server from `pnpm db:test-postgres` (or MERRAN_TEST_POSTGRES_URL).
export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: { name: "sqlite", env: { MERRAN_TEST_DB: "sqlite" } },
      },
      {
        extends: true,
        test: { name: "postgres", env: { MERRAN_TEST_DB: "postgres" } },
      },
    ],
  },
})
