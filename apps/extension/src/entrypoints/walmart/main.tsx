import { StrictMode, useEffect, useState } from "react"
import { createRoot } from "react-dom/client"

import "@/lib/ui.css"

// Asks the browser to let the extension work on walmart.com, which only a
// page of the extension's own can, and only when the person clicks. Merran's
// Walmart page opens it, and it takes them back there once it's allowed.

type Step = "asking" | "allowed" | "refused"

/** As lib/walmart.ts asks for it, without bringing the rest of it here. */
const WALMART_ACCESS = { origins: ["https://www.walmart.com/*"] }

/** The Merran tab that opened this, to go back to. */
const back = Number(new URLSearchParams(location.search).get("back"))

async function goBack() {
  const here = await browser.tabs.getCurrent()
  if (Number.isInteger(back) && back > 0) {
    try {
      await browser.tabs.update(back, { active: true })
    } catch {
      // Closed: stay here.
      return
    }
  }
  if (here?.id !== undefined) await browser.tabs.remove(here.id)
}

function WalmartAccess() {
  const [step, setStep] = useState<Step>("asking")

  useEffect(() => {
    void browser.permissions.contains(WALMART_ACCESS).then((has) => {
      if (has) setStep("allowed")
    })
  }, [])

  async function allow() {
    const granted = await browser.permissions.request(WALMART_ACCESS)
    setStep(granted ? "allowed" : "refused")
    if (granted) setTimeout(() => void goBack(), 1200)
  }

  return (
    <main className="page stack">
      <div className="brand">
        <img src="/icons/48.png" alt="" />
        <h1>Merran</h1>
      </div>
      <h2>Let Merran fill your Walmart cart</h2>
      <p>
        To find things and put them in your cart, the extension opens Walmart in
        a tab of its own and reads and clicks there, as you would. It only does
        that when you ask from Merran.
      </p>
      <p className="muted">
        It never sees your Walmart password or card, and checking out is always
        yours. If Walmart asks whether you're a person, it stops and asks you to
        finish that in the tab.
      </p>
      {step === "allowed" ? (
        <section className="card" role="status">
          <p className="title">Done. Taking you back to Merran…</p>
          <button
            type="button"
            className="outline"
            onClick={() => void goBack()}
          >
            Back to Merran
          </button>
        </section>
      ) : (
        <>
          {step === "refused" && (
            <p className="error">
              Without it the extension can't work on Walmart's site. You can ask
              again any time.
            </p>
          )}
          <div className="row">
            <button type="button" onClick={() => void allow()}>
              Allow on walmart.com
            </button>
          </div>
          <p className="muted small">
            Your browser asks you next. You can take it away any time in the
            extension's details, under Site access.
          </p>
        </>
      )}
    </main>
  )
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WalmartAccess />
  </StrictMode>
)
