import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto"

/**
 * A secret as it's stored. The value is sealed with a data key of its own,
 * and the data key is sealed with the server's master key, so changing the
 * master key only means sealing the data keys again.
 */
export type Sealed = {
  /** Which master key sealed the data key. */
  keyId: string
  /** The data key, sealed with the master key. */
  dataKey: string
  /** The value, sealed with the data key. */
  value: string
}

/** A secret sealed with a master key this server doesn't have. */
export class UnreadableSecretError extends Error {
  constructor(keyId: string) {
    super(
      `This secret was sealed with another master key (${keyId}). Was MERRAN_SECRET or data/secret changed?`
    )
    this.name = "UnreadableSecretError"
  }
}

const ALGORITHM = "aes-256-gcm"
const IV_BYTES = 12
const TAG_BYTES = 16

/** AES-256-GCM. The result is the IV, the tag and the ciphertext, in base64. */
function sealWith(key: Buffer, plaintext: Buffer, label: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  cipher.setAAD(Buffer.from(label))
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64")
}

function openWith(key: Buffer, sealed: string, label: string): Buffer {
  const bytes = Buffer.from(sealed, "base64")
  const decipher = createDecipheriv(ALGORITHM, key, bytes.subarray(0, IV_BYTES))
  decipher.setAAD(Buffer.from(label))
  decipher.setAuthTag(bytes.subarray(IV_BYTES, IV_BYTES + TAG_BYTES))
  return Buffer.concat([
    decipher.update(bytes.subarray(IV_BYTES + TAG_BYTES)),
    decipher.final(),
  ])
}

function derive(serverSecret: string, purpose: string, bytes: number) {
  return Buffer.from(
    hkdfSync("sha256", serverSecret, "", `merran secrets: ${purpose}`, bytes)
  )
}

/**
 * Seals and opens stored secrets, like AI keys, with a master key made from
 * the server's secret. Nothing sealed can be read from the database alone.
 */
export class SecretBox {
  /** Names the master key without giving any of it away. */
  readonly keyId: string
  readonly #masterKey: Buffer

  constructor(serverSecret: string) {
    this.#masterKey = derive(serverSecret, "master key", 32)
    this.keyId = derive(serverSecret, "key id", 6).toString("hex")
  }

  seal(value: string): Sealed {
    const dataKey = randomBytes(32)
    return {
      keyId: this.keyId,
      dataKey: sealWith(this.#masterKey, dataKey, "data key"),
      value: sealWith(dataKey, Buffer.from(value, "utf8"), "value"),
    }
  }

  open(sealed: Sealed): string {
    return openWith(this.#dataKey(sealed), sealed.value, "value").toString(
      "utf8"
    )
  }

  /** Seals the data key again with another master key. The value isn't touched. */
  rewrap(sealed: Sealed, next: SecretBox): Sealed {
    return {
      keyId: next.keyId,
      dataKey: sealWith(next.#masterKey, this.#dataKey(sealed), "data key"),
      value: sealed.value,
    }
  }

  #dataKey(sealed: Sealed): Buffer {
    if (sealed.keyId !== this.keyId) {
      throw new UnreadableSecretError(sealed.keyId)
    }
    return openWith(this.#masterKey, sealed.dataKey, "data key")
  }
}
