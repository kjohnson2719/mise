import { Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"
import { ExtensionError } from "@/features/extension/bridge"
import { api, ApiError, unwrap } from "@/lib/api/client"

import { ProductSummary } from "./product-summary"
import type { BasketLine, StoreProduct } from "./queries"

/** The thing a product's picked for: one on the list, by id. */
export type PickFor = Pick<BasketLine, "itemId" | "name">

/** Kroger's search and pick, through Merran's server. */
const KROGER = {
  search: async (q: string) =>
    (
      await unwrap(
        api.GET("/api/stores/kroger/search", { params: { query: { q } } })
      )
    ).products,
  pick: (line: PickFor, product: StoreProduct) =>
    unwrap(
      api.PUT("/api/stores/kroger/products/{itemId}", {
        params: { path: { itemId: line.itemId } },
        body: { productId: product.id },
      })
    ),
}

/**
 * Picks another product for a thing on the list: a search of the store,
 * and the pick is kept for next time. Kroger's unless the store's own
 * search and pick are given: Walmart's go through the browser extension,
 * and it opens on what Walmart had (`start`) rather than searching again.
 * A search that answers null has said why itself.
 */
export function ProductSearchDialog({
  line,
  store,
  today,
  onOpenChange,
  onPicked,
  search: searchStore = KROGER.search,
  pick: pickAtStore = KROGER.pick,
  start,
  hint,
}: {
  line: PickFor | null
  store: string
  today: string
  onOpenChange: (open: boolean) => void
  onPicked: (line: BasketLine) => void
  search?: (q: string) => Promise<StoreProduct[] | null>
  pick?: (line: PickFor, product: StoreProduct) => Promise<BasketLine>
  /** What to offer as it opens, in place of searching for the thing. */
  start?: (line: PickFor) => Promise<StoreProduct[]>
  /** Where it searches, when it's not Merran's server. */
  hint?: string
}) {
  const { t } = useTranslation()
  const [term, setTerm] = React.useState("")
  const [found, setFound] = React.useState<StoreProduct[] | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)

  // A fresh search for each thing, or what the store had for it, looking
  // (the spinner) from the moment it opens. Only the latest opening goes
  // on: React opens it twice while developing.
  React.useEffect(() => {
    if (!line) return
    let live = true
    setTerm(line.name)
    setFound(null)
    if (start) void begin(line, start, () => live)
    else void search(line.name)
    return () => {
      live = false
    }
  }, [line?.itemId])

  async function begin(
    line: PickFor,
    start: (line: PickFor) => Promise<StoreProduct[]>,
    live: () => boolean
  ) {
    setBusy("search")
    let products: StoreProduct[] = []
    try {
      products = await start(line)
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    }
    if (!live()) return
    if (products.length > 0) {
      setFound(products)
      setBusy(null)
      return
    }
    // Nothing kept for it: look now, still looking.
    await search(line.name)
  }

  // The search going now, so the same words aren't searched twice at once:
  // React runs the opening search twice while developing, and Walmart's
  // search in the person's tab can only do one at a time.
  const searching = React.useRef<{ words: string; done: Promise<void> } | null>(
    null
  )

  async function search(q: string) {
    const words = q.trim()
    if (words.length < 2) return
    if (searching.current?.words === words) return searching.current.done
    const done = (async () => {
      setBusy("search")
      try {
        const products = await searchStore(words)
        if (products) setFound(products)
      } catch (err) {
        if (!(err instanceof ApiError || err instanceof ExtensionError)) {
          throw err
        }
        toast.error(err.message)
      } finally {
        setBusy(null)
      }
    })()
    searching.current = { words, done }
    try {
      await done
    } finally {
      if (searching.current?.done === done) searching.current = null
    }
  }

  async function pick(product: StoreProduct) {
    if (!line) return
    setBusy(product.id)
    try {
      onPicked(await pickAtStore(line, product))
      onOpenChange(false)
    } catch (err) {
      if (!(err instanceof ApiError || err instanceof ExtensionError)) throw err
      toast.error(err.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog open={line !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t("stores.basket.pickTitle", { name: line?.name })}
          </DialogTitle>
          <DialogDescription>
            {hint ?? t("stores.basket.pickHint", { store })}
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void search(term)
          }}
        >
          <InputGroup>
            <InputGroupInput
              aria-label={t("stores.basket.search")}
              value={term}
              onChange={(event) => setTerm(event.target.value)}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                type="submit"
                size="icon-xs"
                disabled={busy !== null || term.trim().length < 2}
                aria-label={t("stores.basket.search")}
              >
                {busy === "search" ? (
                  <Spinner />
                ) : (
                  <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
                )}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </form>
        <div className="-mx-2 max-h-[60vh] overflow-y-auto px-2">
          {found && found.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("stores.basket.nothingFound", { store })}
            </p>
          )}
          {found && found.length > 0 && (
            <ul className="grid gap-1">
              {found.map((product) => (
                <li key={product.id}>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void pick(product)}
                    className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-muted disabled:opacity-60"
                  >
                    <ProductSummary product={product} today={today} />
                    {busy === product.id && <Spinner />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
