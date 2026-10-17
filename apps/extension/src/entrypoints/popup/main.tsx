import { StrictMode, useEffect, useState, type FormEvent } from "react"
import { createRoot } from "react-dom/client"

import { isVideoPage, openListPanel, readTab, type Added } from "@/lib/actions"
import { HouseholdSwitch } from "@/lib/households"
import {
  originOf,
  removeConnection,
  useConnections,
  type Connection,
} from "@/lib/merran"
import type { PageRead } from "@/lib/page"
import "@/lib/ui.css"

// The toolbar button's popup: connecting to a Merran, then adding the page
// open in this tab, and opening the shopping list beside it.

function Popup() {
  const connections = useConnections()
  if (!connections) return null
  return connections.current ? (
    <Connected connection={connections.current} all={connections.all} />
  ) : (
    <Connect />
  )
}

function Brand() {
  return (
    <div className="brand">
      <img src="/icons/48.png" alt="" />
      <h1>Merran</h1>
    </div>
  )
}

/** Connecting: the address of the person's Merran, then Merran asks them. */
function Connect() {
  const [address, setAddress] = useState("")
  const [error, setError] = useState<string>()

  async function connect(event: FormEvent) {
    event.preventDefault()
    setError(undefined)
    let origin: string
    try {
      origin = originOf(address)
    } catch {
      setError("That doesn't look like an address.")
      return
    }
    // The browser asks the person to let the extension reach their Merran.
    const granted = await browser.permissions.request({
      origins: [`${origin}/*`],
    })
    if (!granted) {
      setError("The extension needs to reach your Merran to connect to it.")
      return
    }
    await browser.runtime.sendMessage({ type: "connect", origin })
    window.close()
  }

  return (
    <form className="popup stack" onSubmit={connect}>
      <Brand />
      <p className="muted">
        Connect to your Merran to add recipes from any page, and keep the
        shopping list beside you while you shop.
      </p>
      <input
        type="text"
        value={address}
        onChange={(event) => setAddress(event.target.value)}
        placeholder="merran.example.com"
        aria-label="Your Merran's address"
        autoFocus
      />
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={!address.trim()}>
        Connect
      </button>
      <p className="muted small">
        Your browser asks to let the extension reach that address, then Merran
        opens to ask you.
      </p>
    </form>
  )
}

type PageState =
  | { step: "reading" }
  | { step: "unreadable" }
  | { step: "ready"; page: PageRead }
  | { step: "adding"; page: PageRead }
  | { step: "added"; page: PageRead; message: string; link: string }
  | { step: "failed"; page: PageRead; message: string }

/** Connected: the page in this tab, and the list. */
function Connected({
  connection,
  all,
}: {
  connection: Connection
  all: Connection[]
}) {
  const [state, setState] = useState<PageState>({ step: "reading" })
  const [windowId, setWindowId] = useState<number>()
  const [tabId, setTabId] = useState<number>()

  useEffect(() => {
    void (async () => {
      const [tab] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      })
      setWindowId(tab?.windowId)
      setTabId(tab?.id)
      if (tab?.id === undefined || !/^https?:/.test(tab.url ?? "")) {
        setState({ step: "unreadable" })
        return
      }
      try {
        setState({ step: "ready", page: await readTab(tab.id) })
      } catch {
        setState({ step: "unreadable" })
      }
    })()
  }, [])

  /** Added by the background, which carries on if this closes. */
  async function add(page: PageRead) {
    if (tabId === undefined) return
    setState({ step: "adding", page })
    const added = (await browser.runtime.sendMessage({
      type: "add-tab",
      tabId,
    })) as Added | undefined
    if (added?.ok) {
      setState({
        step: "added",
        page,
        message: added.message,
        link: added.link,
      })
    } else {
      setState({
        step: "failed",
        page,
        message: added?.message ?? "That didn't work. Try again.",
      })
    }
  }

  async function showList() {
    await openListPanel(windowId)
    window.close()
  }

  /** Connects another household: Merran asks which. */
  async function addHousehold() {
    await browser.runtime.sendMessage({
      type: "connect",
      origin: connection.origin,
    })
    window.close()
  }

  return (
    <div className="popup stack">
      <div className="row between">
        <Brand />
        <HouseholdSwitch current={connection} all={all} />
      </div>

      <section className="card">
        {state.step === "reading" ? (
          <p className="muted">Reading this page…</p>
        ) : state.step === "unreadable" ? (
          <p className="muted">
            Open a recipe's page to add it to your recipes.
          </p>
        ) : (
          <>
            <p className="title">{state.page.title || state.page.url}</p>
            {state.step === "ready" && (
              <>
                <p className="muted small">
                  {isVideoPage(state.page.url)
                    ? "A video: Merran watches it and writes its recipe up, if your household has AI."
                    : state.page.hasRecipe
                      ? "There's a recipe on this page."
                      : "No recipe data here: Merran's AI reads the page, if your household has AI."}
                </p>
                <button type="button" onClick={() => void add(state.page)}>
                  Add this recipe
                </button>
              </>
            )}
            {state.step === "adding" && (
              <>
                <button type="button" disabled>
                  {isVideoPage(state.page.url)
                    ? "Watching the video…"
                    : "Adding…"}
                </button>
                <p className="muted small">
                  You can close this: Merran says on the page when it's done.
                </p>
              </>
            )}
            {state.step === "added" && (
              <>
                <p>{state.message}</p>
                <a href={state.link} target="_blank" rel="noreferrer">
                  Open it in Merran
                </a>
              </>
            )}
            {state.step === "failed" && (
              <>
                <p className="error">{state.message}</p>
                <button
                  type="button"
                  className="outline"
                  onClick={() => void add(state.page)}
                >
                  Try again
                </button>
              </>
            )}
          </>
        )}
      </section>

      <button type="button" className="outline" onClick={() => void showList()}>
        Shopping list
      </button>

      <div className="row between">
        <a
          href={connection.origin}
          target="_blank"
          rel="noreferrer"
          className="small"
        >
          {new URL(connection.origin).host}
        </a>
        <span className="row">
          <button
            type="button"
            className="ghost small"
            onClick={() => void addHousehold()}
          >
            Add a household
          </button>
          <button
            type="button"
            className="ghost small"
            onClick={() => void removeConnection(connection.keyId)}
            title="Its key stays in Merran until you take it away in Settings, You, API keys."
          >
            Disconnect
          </button>
        </span>
      </div>
    </div>
  )
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Popup />
  </StrictMode>
)
