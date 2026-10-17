import {
  ArrowLeft02Icon,
  ArrowRight02Icon,
  Cancel01Icon,
  Mic01Icon,
  MinusSignCircleIcon,
  TextFontIcon,
  Timer02Icon,
  VolumeHighIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  convertTemperatures,
  displayIngredient,
  firstDuration,
  goodVoices,
  ingredientsInStep,
  pairRecipes,
  splitDurations,
  voiceLabel,
  type CookCommand,
  type UnitSystem,
} from "@merran/shared"
import { useCanGoBack, useNavigate, useRouter } from "@tanstack/react-router"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { CookNoteDialog, LastCookNote } from "@/features/recipes/cook-notes"
import { formatServings } from "@/features/recipes/format"
import {
  convertible,
  IngredientList,
  UnitToggle,
  useTicks,
} from "@/features/recipes/ingredient-list"
import { useRefreshRecipes, type Recipe } from "@/features/recipes/queries"
import { withMarks } from "@/features/recipes/swaps/marks"
import { StepSwapNote } from "@/features/recipes/swaps/step-swap-note"
import { SwapDialog } from "@/features/recipes/swaps/swap-dialog"
import { useCapability } from "@/features/capabilities/queries"
import {
  clearSwaps,
  useSwapsThisTime,
  withSwaps,
} from "@/features/recipes/swaps/this-time"
import { mergeLeftOut, useRecipeTastes } from "@/features/recipes/use-tastes"
import { useUnitSystem } from "@/features/recipes/use-unit-system"
import { api, ApiError, unwrap } from "@/lib/api/client"
import { cn } from "@/lib/utils"

import {
  loadProgress,
  saveProgress,
  TEXT_SIZES,
  useTextSize,
  type TextSize,
} from "./progress"
import { NewTimerButton, startTimer, TimerChips, type Cooking } from "./timers"
import { formatDuration, stepWords } from "./durations"
import { handsFreeSupported, useHandsFree } from "./hands-free"
import { useWakeLock } from "./use-wake-lock"
import { readingLanguage, testVoice, useVoiceChoice, useVoices } from "./voices"

type Line = Recipe["ingredients"][number]

const STEP_TEXT: Record<TextSize, string> = {
  standard: "text-2xl md:text-3xl lg:text-4xl",
  large: "text-3xl md:text-4xl lg:text-5xl",
  huge: "text-4xl md:text-5xl lg:text-6xl",
}

const DETAIL_TEXT: Record<TextSize, string> = {
  standard: "text-base",
  large: "text-lg",
  huge: "text-xl",
}

/**
 * Cooking a recipe: getting everything out first, then one step at a time in
 * big text, with timers, the step's ingredients, and the screen kept on.
 */
export function CookView({
  recipe,
  paired,
  scale,
}: {
  recipe: Recipe
  /** A recipe it goes with, cooked with it: its lines first. */
  paired?: Recipe
  scale: number
}) {
  const { t } = useTranslation()
  const router = useRouter()
  const canGoBack = useCanGoBack()
  const navigate = useNavigate()
  const refresh = useRefreshRecipes()
  // Stand-ins used this time, from the recipe page or picked while cooking.
  const thisTime = useSwapsThisTime(recipe.id)
  const { swaps } = thisTime
  const aiOn = useCapability("ai")
  const [swapping, setSwapping] = React.useState<Line | null>(null)
  const swapped = React.useMemo(() => withSwaps(recipe, swaps), [recipe, swaps])
  const both = paired ? pairRecipes(swapped.recipe, paired, scale) : null
  const ingredients = both?.ingredients ?? swapped.recipe.ingredients
  const steps = both?.steps ?? swapped.recipe.steps
  /** How much each line is scaled: a pairing has its own amount. */
  const factorOf = (lineId: string) => both?.factors.get(lineId) ?? scale
  /** Lines left out for someone who doesn't like them. */
  const leftOut = mergeLeftOut(
    useRecipeTastes(swapped.recipe),
    useRecipeTastes(paired)
  )
  const name = paired
    ? t("recipes.pairing.name", { base: recipe.name, paired: paired.name })
    : recipe.name

  // A "get ready" page first, to gather everything, then the steps.
  const hasPrep = ingredients.length > 0
  const pages = steps.length + (hasPrep ? 1 : 0)
  const [resumed] = React.useState(() =>
    loadProgress(recipe.id, scale, paired?.id ?? null)
  )
  const [page, setPage] = React.useState(() =>
    Math.min(resumed?.page ?? 0, Math.max(0, pages - 1))
  )
  const ticks = useTicks(resumed?.ticked)
  const [system, setSystem] = useUnitSystem()
  const [textSize, setTextSize] = useTextSize()
  const screenOn = useWakeLock()
  const [finishing, setFinishing] = React.useState(false)
  const [asking, setAsking] = React.useState(false)
  const swipe = React.useRef<{ x: number; y: number } | null>(null)

  const onPrep = hasPrep && page === 0
  const stepIndex = page - (hasPrep ? 1 : 0)
  const step = onPrep ? undefined : steps[stepIndex]
  const next = onPrep ? undefined : steps[stepIndex + 1]
  const isLast = page >= pages - 1
  const highlighted = React.useMemo(() => {
    if (!step) return new Set<string>()
    // Cooked with a pairing, a step only uses its own recipe's ingredients.
    const from = "from" in step ? step.from : undefined
    return ingredientsInStep(
      step.text,
      ingredients.filter((line) => !("from" in line) || line.from === from)
    )
  }, [step, ingredients])
  const stepLines = ingredients.filter((line) => highlighted.has(line.id))
  const stepIngredients = stepLines.filter((line) => !leftOut.has(line.id))
  const stepLeftOut = stepLines.filter((line) => leftOut.has(line.id))
  const cooking: Cooking = {
    slug: recipe.slug,
    scale,
    ...(paired ? { with: paired.slug } : {}),
  }
  const showUnits = convertible(ingredients)

  const go = React.useCallback(
    (to: number) => setPage(Math.min(Math.max(0, to), Math.max(0, pages - 1))),
    [pages]
  )

  // Picked up where it was left: say so, with a way back to the start.
  const { clear } = ticks
  React.useEffect(() => {
    if (!resumed || resumed.page === 0) return
    toast(t("cook.resumed"), {
      id: "cook-resumed",
      position: "top-center",
      action: {
        label: t("cook.startOver"),
        onClick: () => {
          setPage(0)
          clear()
        },
      },
    })
  }, [resumed, t, clear])

  React.useEffect(() => {
    saveProgress(
      recipe.id,
      page === 0 && ticks.ticked.size === 0
        ? null
        : {
            page,
            ticked: [...ticks.ticked],
            scale,
            with: paired?.id ?? null,
            savedAt: Date.now(),
          }
    )
  }, [recipe.id, page, ticks.ticked, scale, paired?.id])

  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (
        event.target instanceof HTMLElement &&
        event.target.closest("input, textarea, [role=menu], [role=dialog]")
      ) {
        return
      }
      if (event.key === "ArrowRight") go(page + 1)
      if (event.key === "ArrowLeft") go(page - 1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [go, page])

  /** Back where cooking started from: the recipe, or wherever it was. */
  function leave() {
    if (canGoBack) router.history.back()
    else void navigate({ to: "/recipes/$slug", params: { slug: recipe.slug } })
  }

  async function finish() {
    setFinishing(true)
    try {
      await unwrap(
        api.POST("/api/recipes/{recipe}/made", {
          params: { path: { recipe: recipe.id } },
        })
      )
      saveProgress(recipe.id, null)
      // Swaps are for this time: next time starts as written.
      clearSwaps(recipe.id)
      await refresh()
      toast.success(t("cook.made"))
      // Then "How did it go?", and back where cooking started.
      setAsking(true)
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      toast.error(error.message)
    } finally {
      setFinishing(false)
    }
  }

  // Hands-free: commands by voice, and each page read aloud.
  const [handsFree, setHandsFree] = React.useState(false)
  const lastRead = React.useRef<number | null>(null)
  /** An ingredient as it's said: "1 and a third tablespoons olive oil". */
  const says = (line: Line) => {
    const { amount, rest } = displayIngredient(line.text, {
      factor: factorOf(line.id),
      system,
    })
    return `${amount}${rest}`.trim()
  }
  const textForPage = (at: number) => {
    if (hasPrep && at === 0) {
      return t("cook.voice.getReady", { count: ingredients.length })
    }
    const number = at - (hasPrep ? 1 : 0)
    const pageStep = steps[number]
    return pageStep
      ? t("cook.voice.step", {
          number: number + 1,
          text: stepWords(t, convertTemperatures(pageStep.text, system)),
        })
      : t("cook.voice.noSteps")
  }
  function timerFor(seconds: number, upTo: number | null = null) {
    const label = formatDuration(t, seconds, upTo)
    startTimer(label, seconds, cooking)
    voice.speak(t("cook.voice.timerSet", { duration: label }))
  }
  const voice = useHandsFree({
    enabled: handsFree,
    onDenied: () => {
      setHandsFree(false)
      toast.error(t("cook.handsFree.denied"))
    },
    onCommand: (command: CookCommand) => {
      switch (command.kind) {
        case "next":
          if (isLast) voice.speak(t("cook.voice.lastStep"))
          else go(page + 1)
          break
        case "back":
          if (page === 0) voice.speak(t("cook.voice.atStart"))
          else go(page - 1)
          break
        case "repeat":
          voice.speak(textForPage(page))
          break
        case "ingredients": {
          const lines = onPrep
            ? ingredients.filter((line) => !leftOut.has(line.id))
            : stepIngredients
          const list = lines.map(says).join(". ")
          voice.speak(
            lines.length === 0
              ? t("cook.voice.noneInStep")
              : onPrep
                ? t("cook.voice.youNeed", { list })
                : t("cook.voice.forThisStep", { list })
          )
          break
        }
        case "timer":
          timerFor(command.seconds)
          break
        case "stepTimer": {
          const time = step
            ? firstDuration(convertTemperatures(step.text, system))
            : undefined
          if (time) timerFor(time.seconds, time.upTo)
          else voice.speak(t("cook.voice.noTimeInStep"))
          break
        }
        case "howMuch": {
          const line = findIngredient(command.food, ingredients)
          voice.speak(
            line ? says(line) : t("cook.voice.cantFind", { food: command.food })
          )
          break
        }
        case "stop":
          voice.stopSpeaking()
          break
        case "done":
          if (!isLast) {
            go(page + 1)
            break
          }
          setHandsFree(false)
          void finish()
          break
      }
    },
  })

  // Each new page is read aloud while hands-free is on, with the next
  // one made ready in the server's voice.
  React.useEffect(() => {
    if (!handsFree) return
    if (!isLast) voice.prepare(textForPage(page + 1))
    if (lastRead.current === page) return
    lastRead.current = page
    voice.speak(textForPage(page))
    // Only turning hands-free on or a new page reads aloud, not each render.
  }, [handsFree, page])

  function toggleHandsFree() {
    if (handsFree) {
      setHandsFree(false)
      lastRead.current = null
      voice.stopSpeaking()
      return
    }
    // Speaking straight from the tap lets phones play it.
    lastRead.current = page
    voice.speak(textForPage(page))
    setHandsFree(true)
  }

  const list = (size: "default" | "lg") => (
    <IngredientList
      lines={ingredients}
      factor={scale}
      factorOf={factorOf}
      system={system}
      ticks={ticks}
      highlighted={highlighted}
      leftOut={leftOut}
      swapped={swapped.lines}
      // A pairing's lines are another recipe's: swap those from its page.
      onSwap={aiOn && !paired ? setSwapping : undefined}
      onUnswap={thisTime.undo}
      size={size}
    />
  )
  const servings = recipe.servings ? recipe.servings * scale : null

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="flex flex-wrap items-center gap-3 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-3 md:px-8">
        <Button variant="outline" onClick={leave}>
          <HugeiconsIcon
            icon={Cancel01Icon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          {t("cook.exit")}
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-heading text-lg font-semibold">{name}</p>
          <p className="text-sm text-muted-foreground">
            {onPrep
              ? t("cook.getReady")
              : steps.length > 0
                ? t("cook.stepOf", {
                    step: stepIndex + 1,
                    count: steps.length,
                  })
                : t("cook.noSteps")}
            {screenOn && ` · ${t("cook.screenOn")}`}
          </p>
        </div>
        {/* Before the buttons, so starting a timer doesn't move them. On
            phones the timers take a row of their own below. */}
        <TimerChips className="order-last w-full sm:order-none sm:w-auto" />
        <div className="flex items-center gap-2">
          {handsFreeSupported() && (
            <Button
              variant={handsFree ? "default" : "outline"}
              size="icon"
              aria-pressed={handsFree}
              aria-label={t("cook.handsFree.label")}
              title={t("cook.handsFree.title")}
              onClick={toggleHandsFree}
            >
              <HugeiconsIcon icon={Mic01Icon} strokeWidth={2} />
            </Button>
          )}
          <NewTimerButton cooking={cooking} />
          <TextSizeMenu value={textSize} onChange={setTextSize} />
        </div>
        {handsFree && (
          <div
            role="status"
            className="order-last flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-secondary px-3 py-2 text-sm"
          >
            <span className="flex items-center gap-2 font-medium">
              <span
                className={cn(
                  "size-2 rounded-full",
                  voice.listening
                    ? "animate-pulse bg-primary"
                    : "bg-muted-foreground/40"
                )}
              />
              {voice.listening
                ? t("cook.handsFree.listening")
                : t("cook.handsFree.label")}
            </span>
            {voice.heard && (
              <span className="text-muted-foreground">
                {t("cook.handsFree.heard", { said: voice.heard })}
              </span>
            )}
            <span className="text-muted-foreground">
              {t("cook.handsFree.hint")}
            </span>
          </div>
        )}
      </header>

      {pages > 1 && (
        <nav aria-label={t("cook.steps")} className="flex gap-1.5 px-4 md:px-8">
          {Array.from({ length: pages }, (_, i) => (
            <button
              key={i}
              type="button"
              aria-label={
                hasPrep && i === 0
                  ? t("cook.goToReady")
                  : t("cook.goToStep", { step: i + (hasPrep ? 0 : 1) })
              }
              aria-current={i === page ? "step" : undefined}
              onClick={() => go(i)}
              className={cn(
                "group py-2",
                hasPrep && i === 0 ? "w-8" : "flex-1"
              )}
            >
              <span
                className={cn(
                  "block h-1.5 rounded-full transition-colors",
                  i <= page
                    ? "bg-primary"
                    : "bg-border group-hover:bg-muted-foreground/40"
                )}
              />
            </button>
          ))}
        </nav>
      )}

      <main
        className={cn(
          "grid flex-1 content-start gap-6 px-4 py-6 md:gap-10 md:px-8",
          !onPrep && hasPrep && "md:grid-cols-[minmax(0,300px)_minmax(0,1fr)]"
        )}
      >
        {!onPrep && hasPrep && (
          <Card className="hidden h-fit md:flex">
            <CardHeader className="grid gap-3">
              <CardTitle className="text-lg font-semibold">
                {t("recipes.fields.ingredients")}
              </CardTitle>
              {showUnits && <UnitToggle system={system} onChange={setSystem} />}
            </CardHeader>
            <CardContent>{list("default")}</CardContent>
          </Card>
        )}

        <section
          aria-live="polite"
          className="grid content-start gap-6 select-none md:pt-4"
          onPointerDown={(event) => {
            if (event.pointerType === "touch") {
              swipe.current = { x: event.clientX, y: event.clientY }
            }
          }}
          onPointerUp={(event) => {
            const from = swipe.current
            swipe.current = null
            if (!from) return
            const dx = event.clientX - from.x
            const dy = event.clientY - from.y
            if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
              go(dx < 0 ? page + 1 : page - 1)
            }
          }}
        >
          {onPrep ? (
            <div className="mx-auto grid w-full max-w-3xl gap-6">
              <div className="grid gap-2">
                <p className="text-sm font-semibold tracking-wide text-primary uppercase">
                  {t("cook.getReady")}
                </p>
                <h1 className="font-heading text-3xl leading-tight font-semibold md:text-4xl">
                  {t("cook.gather")}
                </h1>
                <p
                  className={cn("text-muted-foreground", DETAIL_TEXT[textSize])}
                >
                  {t("cook.gatherHint")}
                  {servings !== null &&
                    ` ${t("cook.makes", {
                      count: servings,
                      servings: formatServings(servings),
                    })}`}
                </p>
              </div>
              <LastCookNote recipeId={recipe.id} />
              {showUnits && (
                <UnitToggle
                  system={system}
                  onChange={setSystem}
                  className="w-fit"
                />
              )}
              <div className="select-text">{list("lg")}</div>
            </div>
          ) : step ? (
            <>
              {step.section && (
                <p className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                  {step.section}
                </p>
              )}
              <p
                className={cn(
                  "leading-snug tracking-tight select-text",
                  STEP_TEXT[textSize]
                )}
              >
                <StepText
                  text={step.text}
                  system={system}
                  cooking={cooking}
                  marks={swapped.steps.get(step.id)?.names}
                />
              </p>
              <StepSwapNote
                key={step.id}
                swap={swapped.steps.get(step.id)}
                system={system}
              />

              {stepIngredients.length > 0 && (
                <div className="grid gap-2">
                  <p className="text-sm font-medium text-muted-foreground">
                    {t("cook.forThisStep")}
                  </p>
                  <ul className="flex flex-wrap gap-2">
                    {stepIngredients.map((line) => {
                      const done = ticks.ticked.has(line.id)
                      const { amount, rest } = displayIngredient(line.text, {
                        factor: factorOf(line.id),
                        system,
                      })
                      return (
                        <li key={line.id}>
                          <button
                            type="button"
                            aria-pressed={done}
                            onClick={() => ticks.toggle(line.id)}
                            className={cn(
                              "rounded-2xl border px-3 py-1.5 text-left transition-colors",
                              DETAIL_TEXT[textSize],
                              done
                                ? "border-transparent bg-muted text-muted-foreground line-through"
                                : "bg-accent text-accent-foreground hover:bg-accent/80"
                            )}
                          >
                            {amount && (
                              <span className="font-semibold">{amount}</span>
                            )}
                            {rest}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}

              {stepLeftOut.length > 0 && (
                <p
                  className={cn(
                    "flex items-start gap-2 text-muted-foreground",
                    DETAIL_TEXT[textSize]
                  )}
                >
                  <HugeiconsIcon
                    icon={MinusSignCircleIcon}
                    strokeWidth={2}
                    className="mt-1 size-4 shrink-0"
                  />
                  <span>
                    {t("cook.leaveOut", {
                      lines: stepLeftOut
                        .map((line) => {
                          const { amount, rest } = displayIngredient(
                            line.text,
                            { factor: factorOf(line.id), system }
                          )
                          return `${amount}${rest}`.trim()
                        })
                        .join(", "),
                    })}
                  </span>
                </p>
              )}

              {next && (
                <p
                  className={cn(
                    "max-w-prose rounded-2xl bg-muted p-4 text-muted-foreground",
                    DETAIL_TEXT[textSize]
                  )}
                >
                  <span className="font-semibold text-foreground">
                    {t("cook.upNext")}
                  </span>{" "}
                  {stepWords(t, convertTemperatures(next.text, system))}
                </p>
              )}
            </>
          ) : (
            <p className="text-lg text-muted-foreground">
              {t("cook.noStepsYet")}
            </p>
          )}
        </section>
      </main>

      <footer className="sticky bottom-0 flex items-center justify-between gap-3 border-t bg-background/95 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur md:px-8">
        <Button
          size="lg"
          variant="outline"
          onClick={() => go(page - 1)}
          disabled={page === 0}
        >
          <HugeiconsIcon
            icon={ArrowLeft02Icon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          {t("cook.back")}
        </Button>
        {!onPrep && hasPrep && (
          <Sheet>
            <SheetTrigger
              render={
                <Button size="lg" variant="secondary" className="md:hidden" />
              }
            >
              {t("recipes.fields.ingredients")}
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[80svh]">
              <SheetHeader className="grid gap-3 pr-14">
                <SheetTitle>{t("recipes.fields.ingredients")}</SheetTitle>
                {showUnits && (
                  <UnitToggle system={system} onChange={setSystem} />
                )}
              </SheetHeader>
              <div className="overflow-y-auto px-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
                {list("default")}
              </div>
            </SheetContent>
          </Sheet>
        )}
        {isLast ? (
          <Button size="lg" onClick={() => void finish()} disabled={finishing}>
            {t("cook.done")}
          </Button>
        ) : (
          <Button size="lg" onClick={() => go(page + 1)}>
            {onPrep ? t("cook.start") : t("cook.next")}
            <HugeiconsIcon
              icon={ArrowRight02Icon}
              strokeWidth={2}
              data-icon="inline-end"
            />
          </Button>
        )}
      </footer>

      <SwapDialog
        recipe={recipe}
        line={swapping}
        factor={scale}
        system={system}
        onUse={thisTime.use}
        onUndo={thisTime.undo}
        onOpenChange={(open) => {
          if (!open) setSwapping(null)
        }}
      />
      <CookNoteDialog
        recipe={recipe}
        open={asking}
        onDone={() => {
          setAsking(false)
          leave()
        }}
      />
    </div>
  )
}

/**
 * A step's words, with each time in it a button that starts a timer. Times
 * read the same way whatever the recipe wrote: "a minute" is "1 minute".
 */
function StepText({
  text,
  system,
  cooking,
  marks = [],
}: {
  text: string
  system: UnitSystem
  cooking: Cooking
  /** Names to mark: a stand-in used this time. */
  marks?: readonly string[]
}) {
  const { t } = useTranslation()
  return splitDurations(convertTemperatures(text, system)).map((piece, i) => {
    if (piece.type === "text") {
      return (
        <React.Fragment key={i}>{withMarks(piece.text, marks)}</React.Fragment>
      )
    }
    const label = formatDuration(t, piece.seconds, piece.upTo)
    return (
      <button
        key={i}
        type="button"
        onClick={() => startTimer(label, piece.seconds, cooking)}
        aria-label={t("cook.timers.startFor", { label })}
        className="mx-0.5 inline-flex items-center gap-1.5 rounded-full bg-highlight px-3 py-0.5 align-baseline font-semibold text-highlight-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <HugeiconsIcon
          icon={Timer02Icon}
          strokeWidth={2}
          className="size-[0.8em]"
        />
        {label}
      </button>
    )
  })
}

/** The ingredient asked about by name: "how much garlic". */
function findIngredient(food: string, lines: Line[]) {
  const words = food
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 2)
  if (words.length === 0) return undefined
  const text = (line: Line) => line.text.toLowerCase()
  return (
    lines.find((line) => words.every((word) => text(line).includes(word))) ??
    lines.find((line) =>
      words.some((word) => text(line).includes(word.replace(/e?s$/, "")))
    )
  )
}

/**
 * Standard, large or extra large steps, and the voice that reads them,
 * kept on this device.
 */
function TextSizeMenu({
  value,
  onChange,
}: {
  value: TextSize
  onChange: (size: TextSize) => void
}) {
  const { t } = useTranslation()
  const voices = handsFreeSupported()
  const label = voices ? t("cook.textSize.withVoice") : t("cook.textSize.label")
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="icon"
            aria-label={label}
            title={label}
          />
        }
      >
        <HugeiconsIcon icon={TextFontIcon} strokeWidth={2} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("cook.textSize.label")}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={value}
            onValueChange={(next) => onChange(next as TextSize)}
          >
            {TEXT_SIZES.map((size) => (
              <DropdownMenuRadioItem key={size} value={size}>
                {t(`cook.textSize.${size}`)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        {voices && <VoiceChoices />}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Which of the device's voices reads steps aloud, with a sentence to try it. */
function VoiceChoices() {
  const { t } = useTranslation()
  const voices = useVoices()
  const [choice, setChoice] = useVoiceChoice()
  const options = goodVoices(voices, readingLanguage())
  const best = options[0]
  // A voice chosen before that's no longer offered shows as the best one.
  const value =
    choice === "auto" || options.some((voice) => voice.voiceURI === choice)
      ? choice
      : "auto"
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuLabel>{t("cook.voice.label")}</DropdownMenuLabel>
        {options.length === 0 ? (
          <p className="px-3 pb-2 text-sm text-muted-foreground">
            {t("cook.voice.none")}
          </p>
        ) : (
          <>
            <DropdownMenuRadioGroup
              value={value}
              onValueChange={(next) => setChoice(String(next))}
            >
              <DropdownMenuRadioItem value="auto">
                <span className="grid">
                  {t("cook.voice.best")}
                  {best && (
                    <span className="text-xs text-muted-foreground">
                      {voiceLabel(best)}
                    </span>
                  )}
                </span>
              </DropdownMenuRadioItem>
              {options.map((voice) => (
                <DropdownMenuRadioItem
                  key={voice.voiceURI}
                  value={voice.voiceURI}
                >
                  {voiceLabel(voice)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            {/* Stays open, to try another. */}
            <DropdownMenuItem
              closeOnClick={false}
              onClick={() => testVoice(value)}
            >
              <HugeiconsIcon icon={VolumeHighIcon} strokeWidth={2} />
              {t("cook.voice.test")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuGroup>
    </>
  )
}
