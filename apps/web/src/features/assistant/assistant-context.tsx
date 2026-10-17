import * as React from "react"

// Where the assistant is opened from, and what it's told is on the screen:
// a recipe, or a week of the plan. Pages say so while they're shown.

/** What's on the screen, for the assistant. */
export type PageContext = {
  recipe?: { id: string; name: string }
  week?: string
}

type Assistant = {
  open: boolean
  setOpen: (open: boolean) => void
  /** The chat shown; null for a new one. */
  chatId: string | null
  setChatId: (chatId: string | null) => void
  page: PageContext | null
  setPage: (page: PageContext | null) => void
}

const AssistantContext = React.createContext<Assistant | null>(null)

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  const [chatId, setChatId] = React.useState<string | null>(null)
  const [page, setPage] = React.useState<PageContext | null>(null)
  const value = React.useMemo(
    () => ({ open, setOpen, chatId, setChatId, page, setPage }),
    [open, chatId, page]
  )
  return (
    <AssistantContext.Provider value={value}>
      {children}
    </AssistantContext.Provider>
  )
}

export function useAssistant() {
  const assistant = React.useContext(AssistantContext)
  if (!assistant) throw new Error("useAssistant needs an AssistantProvider.")
  return assistant
}

/** Tells the assistant what this page shows, while it's shown. */
export function useAssistantPage(page: PageContext | null) {
  const assistant = React.useContext(AssistantContext)
  const setPage = assistant?.setPage
  const key = JSON.stringify(page)
  React.useEffect(() => {
    if (!setPage) return
    setPage(key === "null" ? null : (JSON.parse(key) as PageContext))
    return () => setPage(null)
  }, [setPage, key])
}
