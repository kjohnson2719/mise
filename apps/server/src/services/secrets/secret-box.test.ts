import { describe, expect, test } from "vitest"
import { SecretBox, UnreadableSecretError } from "./secret-box.ts"

const box = new SecretBox("a server secret that is long enough to use")
const other = new SecretBox("another server secret, just as long as that")

describe("sealed secrets", () => {
  test("open to what was sealed", () => {
    const sealed = box.seal("sk-ant-a-key-to-keep")

    expect(box.open(sealed)).toBe("sk-ant-a-key-to-keep")
  })

  test("give nothing away when stored", () => {
    const sealed = box.seal("sk-ant-a-key-to-keep")

    expect(JSON.stringify(sealed)).not.toContain("a-key-to-keep")
    expect(sealed.keyId).toBe(box.keyId)
    // The same value sealed twice looks different each time.
    expect(box.seal("sk-ant-a-key-to-keep").value).not.toBe(sealed.value)
  })

  test("need the master key they were sealed with", () => {
    const sealed = box.seal("sk-ant-a-key-to-keep")

    expect(() => other.open(sealed)).toThrow(UnreadableSecretError)
    expect(() => other.open({ ...sealed, keyId: other.keyId })).toThrow()
  })

  test("can't be changed without it showing", () => {
    const sealed = box.seal("sk-ant-a-key-to-keep")
    const bytes = Buffer.from(sealed.value, "base64")
    bytes[bytes.length - 1]! ^= 1

    expect(() =>
      box.open({ ...sealed, value: bytes.toString("base64") })
    ).toThrow()
  })

  test("move to a new master key without the value changing", () => {
    const sealed = box.seal("sk-ant-a-key-to-keep")
    const moved = box.rewrap(sealed, other)

    expect(moved.keyId).toBe(other.keyId)
    expect(moved.value).toBe(sealed.value)
    expect(other.open(moved)).toBe("sk-ant-a-key-to-keep")
    expect(() => box.open(moved)).toThrow(UnreadableSecretError)
  })

  test("name their master key without giving it away", () => {
    expect(box.keyId).toMatch(/^[0-9a-f]{12}$/)
    expect(box.keyId).not.toBe(other.keyId)
    expect(
      new SecretBox("a server secret that is long enough to use").keyId
    ).toBe(box.keyId)
  })
})
