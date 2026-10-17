import { expect, test } from "vitest"
import { rangeOf } from "./report.ts"

test("counts are sent only as ranges", () => {
  const bands = [1, 5, 20]
  expect(rangeOf(0, bands)).toBe("0")
  expect(rangeOf(1, bands)).toBe("1")
  expect(rangeOf(2, bands)).toBe("2-5")
  expect(rangeOf(5, bands)).toBe("2-5")
  expect(rangeOf(6, bands)).toBe("6-20")
  expect(rangeOf(21, bands)).toBe("21+")
  expect(rangeOf(450, [99, 499, 1999])).toBe("100-499")
})
