// Merran's commands, for the people running a server:
//
//   pnpm merran <command>                       from a checkout
//   docker exec -it merran merran <command>     in the Docker image

import { foodsFdc } from "./foods-fdc.ts"
import { foodsCoverage } from "./foods.ts"
import { rotateSecret } from "./rotate-secret.ts"

const COMMANDS: Record<
  string,
  { description: string; run: (args: string[]) => Promise<number> }
> = {
  "rotate-secret": {
    description:
      "Change the server's secret, sealing every saved key again with the new one.",
    run: () => rotateSecret(),
  },
  foods: {
    description:
      "How many of this server's ingredient lines (or a file's: text, one to a line, or JSON Lines recipes with an ingredients list) name a food Merran knows, and the foods it doesn't. `foods fdc <file>` proposes a USDA food for each food without one, for checking.",
    run: (args) =>
      args[0] === "fdc" ? foodsFdc(args.slice(1)) : foodsCoverage(args),
  },
}

const [name, ...args] = process.argv.slice(2)
const command = name ? COMMANDS[name] : undefined

if (!command) {
  console.log("Usage: merran <command>\n\nCommands:")
  for (const [commandName, { description }] of Object.entries(COMMANDS)) {
    console.log(`  ${commandName.padEnd(16)}${description}`)
  }
  process.exit(name ? 1 : 0)
}

try {
  process.exit(await command.run(args))
} catch (err) {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
}
