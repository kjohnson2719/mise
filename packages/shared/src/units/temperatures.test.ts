import { expect, test } from "vitest"
import { convertTemperatures } from "./temperatures.ts"

test("oven temperatures are shown in the chosen degrees", () => {
  const step = "Heat the oven to 350°F. Bake 20 minutes."

  expect(convertTemperatures(step, "metric")).toBe(
    "Heat the oven to 175°C. Bake 20 minutes."
  )
  expect(convertTemperatures(step, "written")).toBe(step)
  expect(convertTemperatures(step, "us")).toBe(step)
  expect(convertTemperatures("Bake at 180 °C", "us")).toBe("Bake at 355°F")
})

test("however they're written", () => {
  expect(convertTemperatures("Roast at 425 degrees F", "metric")).toBe(
    "Roast at 220°C"
  )
  expect(convertTemperatures("Roast at 425F", "metric")).toBe("Roast at 220°C")
  expect(convertTemperatures("Heat to 200 degrees Celsius", "us")).toBe(
    "Heat to 390°F"
  )
})

test("cups and bare degrees are left alone", () => {
  expect(convertTemperatures("Add 2 C flour", "metric")).toBe("Add 2 C flour")
  expect(convertTemperatures("Bake at 350°", "metric")).toBe("Bake at 350°")
})
