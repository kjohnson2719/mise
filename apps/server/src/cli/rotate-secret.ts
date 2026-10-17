import { loadConfig } from "../core/config.ts"
import { loadSecret, newSecret, writeSecretFile } from "../core/secret.ts"
import { migrate, openDatabase } from "../database/orm.ts"
import { rotateSecrets } from "../services/secrets/rotate.ts"
import { SecretBox } from "../services/secrets/secret-box.ts"

/**
 * Changes the server's secret, sealing every saved key again with the new
 * one. With MERRAN_SECRET set, the new secret comes from MERRAN_NEW_SECRET
 * (read only by this command), and MERRAN_SECRET must be changed to it
 * afterwards. Otherwise a new one is made and kept in the data folder.
 */
export async function rotateSecret(
  env: Record<string, string | undefined> = process.env
): Promise<number> {
  const config = loadConfig(env)
  const oldSecret = loadSecret(config)

  let next: string
  if (config.secret) {
    const given = env.MERRAN_NEW_SECRET ?? ""
    if (given.length < 32 || given === oldSecret) {
      console.error(
        "MERRAN_SECRET is set, so give the new secret as MERRAN_NEW_SECRET: at least 32 characters, and different from the old one."
      )
      return 1
    }
    next = given
  } else {
    next = newSecret()
  }

  const database = await openDatabase(config.database)
  try {
    await migrate(database)
    const result = await rotateSecrets(
      database.em.fork(),
      new SecretBox(oldSecret),
      new SecretBox(next)
    )
    if (!config.secret) writeSecretFile(config.dataDir, next)

    console.log(
      `Sealed ${result.rotated} saved secret(s) with the new secret` +
        (result.alreadyDone ? `, and ${result.alreadyDone} already were` : "") +
        "."
    )
    if (result.unreadable) {
      console.log(
        `${result.unreadable} secret(s) were sealed with a secret older than this one, so they can't be read: enter them again in Settings.`
      )
    }
    console.log(
      config.secret
        ? "Now change MERRAN_SECRET to the new secret and restart Merran. Everyone will need to sign in again."
        : "The new secret is in the data folder. Restart Merran now. Everyone will need to sign in again."
    )
    return 0
  } finally {
    await database.close()
  }
}
