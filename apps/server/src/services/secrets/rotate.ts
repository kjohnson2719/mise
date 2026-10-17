import type { EntityManager } from "@mikro-orm/sql"
import { Secret } from "../../database/entities/index.ts"
import type { SecretBox } from "./secret-box.ts"

export type RotationResult = {
  /** Sealed again with the new master key. */
  rotated: number
  /** Already sealed with the new master key, from an earlier run. */
  alreadyDone: number
  /** Sealed with some other master key, so they can't be read by either. */
  unreadable: number
}

/**
 * Seals every stored secret's data key with a new master key, in one
 * transaction. Safe to run again: secrets already on the new key are left.
 */
export async function rotateSecrets(
  em: EntityManager,
  from: SecretBox,
  to: SecretBox
): Promise<RotationResult> {
  return em.transactional(async (tx) => {
    const result: RotationResult = { rotated: 0, alreadyDone: 0, unreadable: 0 }
    for (const secret of await tx.find(Secret, {})) {
      if (secret.keyId === to.keyId) {
        result.alreadyDone++
      } else if (secret.keyId === from.keyId) {
        const { keyId, dataKey } = from.rewrap(secret, to)
        secret.keyId = keyId
        secret.dataKey = dataKey
        result.rotated++
      } else {
        result.unreadable++
      }
    }
    return result
  })
}
