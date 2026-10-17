// Saves the API reference as src/http/openapi/openapi.json, for docs sites and
// anyone building on Merran:
//
//   pnpm openapi
//
// A test fails when the saved file is out of date.

import { writeFileSync } from "node:fs"
import { createOpenApiFile } from "./file.ts"

const file = new URL("./openapi.json", import.meta.url)
writeFileSync(file, await createOpenApiFile())
console.log("Wrote openapi.json")
