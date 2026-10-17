/**
 * Functions run inside the person's Walmart tab with
 * scripting.executeScript. Each is sent on its own, so it can't use
 * anything from outside itself. Reading is left to `@merran/shared`, in the
 * background: these only hand back what the page has, and press Walmart's
 * own buttons as the person would.
 */

/** What's on the page: its address, title, the start of its words, and its data. */
export function readWalmartPage() {
  return {
    url: location.href,
    title: document.title,
    text: (document.body?.innerText ?? "").slice(0, 3000),
    data: document.getElementById("__NEXT_DATA__")?.textContent ?? null,
  }
}

/** How adding to the cart went. */
export type AddedOnPage = {
  ok: boolean
  /** How many the cart has now. */
  quantity: number
  /** Walmart asked whether it's a person, part way. */
  check: boolean
  why: "out_of_stock" | "not_added" | null
}

/**
 * On a product's page, presses Walmart's own "Add to cart", then "+" until
 * the cart has at least `quantity`: one already there is topped up, not
 * added again, so carrying on part way never doubles anything. Waits for
 * Walmart's page to be live before pressing, and for Walmart after each
 * press, and stops if Walmart asks whether it's a person.
 */
export async function addToCartOnPage(quantity: number): Promise<AddedOnPage> {
  const isCheck = () =>
    /robot or human/i.test(document.title) ||
    /robot or human\?|press\s*(?:&|and)\s*hold/i.test(
      (document.body?.innerText ?? "").slice(0, 3000)
    )
  // Waits for something on the page, looking again as soon as the page
  // changes: a browser slows timers down in a tab in the background, but
  // not this. And now and then besides, for what changes without the page
  // changing, like Walmart's page coming to life.
  const until = <T>(find: () => T | null, ms: number) =>
    new Promise<T | null>((resolve) => {
      let done = false
      const finish = (value: T | null) => {
        if (done) return
        done = true
        observer.disconnect()
        clearInterval(tick)
        clearTimeout(timer)
        resolve(value)
      }
      const look = () => {
        if (isCheck()) return finish(null)
        const found = find()
        if (found) finish(found)
      }
      const observer = new MutationObserver(look)
      observer.observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
      })
      const tick = setInterval(look, 200)
      const timer = setTimeout(() => finish(find()), ms)
      look()
    })
  let name = ""
  try {
    const data = JSON.parse(
      document.getElementById("__NEXT_DATA__")?.textContent ?? "{}"
    )
    name = String(
      data?.props?.pageProps?.initialData?.data?.product?.name ?? ""
    )
  } catch {
    // Then the first "+" on the page is this product's.
  }
  // This product's "+", which says how many the cart has: "… Current
  // Quantity 2". The page has others, for products like it: one that says
  // this product's name, else one that wasn't there before pressing Add to
  // cart, never one that was.
  let others: Set<Element> | null = null
  const plusButtons = () =>
    Array.from(
      document.querySelectorAll<HTMLButtonElement>(
        '[data-testid="quantity-stepper-inc-button"]'
      )
    )
  const plus = () => {
    const buttons = plusButtons()
    const named = name
      ? buttons.find((button) =>
          (button.getAttribute("aria-label") ?? "").includes(name)
        )
      : undefined
    return named ?? buttons.find((button) => !others?.has(button)) ?? null
  }
  const addButton = () =>
    document.querySelector<HTMLButtonElement>(
      'button[data-automation-id="atc"]'
    )
  const inCart = () =>
    Number(
      /Current Quantity (\d+)/i.exec(
        plus()?.getAttribute("aria-label") ?? ""
      )?.[1] ?? 0
    )
  // Walmart's page shows its buttons before they work: React wires them up
  // a moment later, and marks each button it has. Pressed before that, a
  // button does nothing; if React's marks ever change, it presses after a
  // few seconds anyway.
  const started = Date.now()
  const live = (button: Element) =>
    Object.keys(button).some((key) => key.startsWith("__reactProps")) ||
    Date.now() - started > 5000
  const end = (why: AddedOnPage["why"]): AddedOnPage => {
    const check = isCheck()
    return { ok: why === null && !check, quantity: inCart(), check, why }
  }

  const first = await until(() => {
    const button = addButton() ?? plus()
    return button && live(button) ? button : null
  }, 12_000)
  if (!first) return end(isCheck() ? null : "not_added")
  if (first === addButton()) {
    if (first.disabled) return end("out_of_stock")
    others = new Set(plusButtons())
    first.click()
    // Once more if it didn't take, while it's still there to press.
    if (!(await until(plus, 6000))) {
      if (isCheck()) return end(null)
      const again = addButton()
      if (!again || again.disabled) return end("not_added")
      again.click()
      if (!(await until(plus, 6000))) return end("not_added")
    }
  }
  // One press at a time, each waited for: Walmart may stop at a most per order.
  for (let tries = 0; inCart() < quantity && tries < quantity + 5; tries++) {
    const before = inCart()
    plus()?.click()
    const more = await until(() => (inCart() > before ? true : null), 4000)
    if (isCheck()) return end(null)
    if (!more) break
  }
  return end(inCart() > 0 ? null : "not_added")
}
