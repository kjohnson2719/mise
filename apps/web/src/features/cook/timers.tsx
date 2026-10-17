import { Cancel01Icon, Timer02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Link } from "@tanstack/react-router"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

import { formatDuration } from "./durations"

/** Where a timer was started from, to get back to it. */
export type Cooking = { slug: string; scale: number; with?: string }

export type Timer = {
  id: string
  label: string
  endsAt: number
  done: boolean
  cooking: Cooking | null
}

// Kitchen timers live outside any page, so they keep running (and ringing)
// anywhere in the app, and are saved so a reload doesn't lose them.
const KEY = "merran-timers"
const listeners = new Set<() => void>()
let timers: Timer[] = load()
let audio: AudioContext | null = null

function load(): Timer[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]")
    return Array.isArray(saved)
      ? saved.filter(
          (timer): timer is Timer =>
            typeof timer?.id === "string" && typeof timer?.endsAt === "number"
        )
      : []
  } catch {
    return []
  }
}

function change(next: Timer[]) {
  timers = next
  try {
    localStorage.setItem(KEY, JSON.stringify(timers))
  } catch {
    // Not saved; they still run until the page reloads.
  }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Sound needs an AudioContext made during a tap, so this runs on one. */
function wakeAudio() {
  try {
    audio ??= new AudioContext()
    void audio.resume()
  } catch {
    // No sound here; timers still buzz and show a message.
  }
}

export function startTimer(
  label: string,
  seconds: number,
  cooking: Cooking | null
) {
  wakeAudio()
  change([
    ...timers,
    {
      id: crypto.randomUUID(),
      label,
      endsAt: Date.now() + seconds * 1000,
      done: false,
      cooking,
    },
  ])
}

/** A minute more, also for one that's just gone off. */
export function addMinute(id: string) {
  wakeAudio()
  toast.dismiss(`timer-${id}`)
  const now = Date.now()
  change(
    timers.map((timer) =>
      timer.id === id
        ? {
            ...timer,
            endsAt: (timer.done ? now : timer.endsAt) + 60_000,
            done: false,
          }
        : timer
    )
  )
}

export function dismissTimer(id: string) {
  toast.dismiss(`timer-${id}`)
  change(timers.filter((timer) => timer.id !== id))
}

export function useTimers() {
  return React.useSyncExternalStore(
    subscribe,
    () => timers,
    () => timers
  )
}

/** Three short beeps. */
function beep(context: AudioContext) {
  for (let i = 0; i < 3; i++) {
    const start = context.currentTime + i * 0.35
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.frequency.value = 880
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(0.4, start + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.25)
    oscillator.connect(gain).connect(context.destination)
    oscillator.start(start)
    oscillator.stop(start + 0.3)
  }
}

/**
 * Rings timers when they finish: a beep, a buzz and a message that stays
 * until it's seen. Mounted once for the whole app.
 */
export function TimerAlarm() {
  const { t } = useTranslation()
  const running = useTimers().some((timer) => !timer.done)

  React.useEffect(() => {
    if (!running) return
    // After a reload there's no sound until the next tap anywhere.
    document.addEventListener("pointerdown", wakeAudio, { once: true })
    const interval = setInterval(() => {
      const now = Date.now()
      const finished = timers.filter(
        (timer) => !timer.done && timer.endsAt <= now
      )
      if (finished.length === 0) return
      for (const timer of finished) {
        if (audio) beep(audio)
        navigator.vibrate?.([300, 150, 300, 150, 300])
        toast(t("cook.timers.up", { label: timer.label }), {
          id: `timer-${timer.id}`,
          duration: Infinity,
          // Up top, clear of the cook view's Next button.
          position: "top-center",
          action: {
            label: t("cook.timers.addMinute"),
            onClick: () => addMinute(timer.id),
          },
          cancel: {
            label: t("cook.timers.ok"),
            onClick: () => dismissTimer(timer.id),
          },
        })
      }
      const ids = new Set(finished.map((timer) => timer.id))
      change(
        timers.map((timer) =>
          ids.has(timer.id) ? { ...timer, done: true } : timer
        )
      )
    }, 500)
    return () => {
      clearInterval(interval)
      document.removeEventListener("pointerdown", wakeAudio)
    }
  }, [running, t])

  return null
}

/** The time now, ticking while there's something to count down. */
function useNow(active: boolean) {
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    if (!active) return
    const interval = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(interval)
  }, [active])
  return now
}

/** "4:05", or "1:04:05" for an hour or more. */
function formatRemaining(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = String(total % 60).padStart(2, "0")
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
    : `${minutes}:${seconds}`
}

const CHIP = {
  running: "bg-highlight text-highlight-foreground",
  done: "animate-pulse bg-destructive text-white",
}

/** Every timer, counting down, with a minute more and cancel. For cooking. */
export function TimerChips({ className }: { className?: string }) {
  const { t } = useTranslation()
  const list = useTimers()
  const now = useNow(list.length > 0)
  if (list.length === 0) return null
  return (
    <ul
      className={cn("flex flex-wrap gap-2", className)}
      aria-label={t("cook.timers.list")}
    >
      {list.map((timer) => (
        <li
          key={timer.id}
          role="timer"
          aria-label={t("cook.timers.label", { label: timer.label })}
          className={cn(
            "flex h-10 items-center gap-1.5 rounded-full pr-1 pl-3 text-sm font-semibold",
            timer.done ? CHIP.done : CHIP.running
          )}
        >
          <HugeiconsIcon
            icon={Timer02Icon}
            strokeWidth={2}
            className="size-4 shrink-0"
          />
          <span className="max-w-28 truncate">{timer.label}</span>
          <span className="tabular-nums">
            {timer.done
              ? t("cook.timers.done")
              : formatRemaining(timer.endsAt - now)}
          </span>
          <button
            type="button"
            onClick={() => addMinute(timer.id)}
            aria-label={t("cook.timers.addMinuteTo", { label: timer.label })}
            className="flex h-8 items-center rounded-full px-2 text-xs hover:bg-black/10"
          >
            +1
          </button>
          <button
            type="button"
            onClick={() => dismissTimer(timer.id)}
            aria-label={
              timer.done
                ? t("cook.timers.dismiss", { label: timer.label })
                : t("cook.timers.cancel", { label: timer.label })
            }
            className="flex size-8 items-center justify-center rounded-full hover:bg-black/10"
          >
            <HugeiconsIcon
              icon={Cancel01Icon}
              strokeWidth={2}
              className="size-4"
            />
          </button>
        </li>
      ))}
    </ul>
  )
}

/**
 * Small countdowns for the top bar while cooking elsewhere in the app, each
 * a link back to the cooking it came from.
 */
export function TimerBadges() {
  const { t } = useTranslation()
  const list = useTimers()
  const now = useNow(list.length > 0)
  if (list.length === 0) return null
  const shown = [...list].sort((a, b) => a.endsAt - b.endsAt).slice(0, 2)
  return (
    <ul
      className="flex items-center gap-1.5"
      aria-label={t("cook.timers.list")}
    >
      {shown.map((timer) => {
        const style = cn(
          "flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-semibold",
          timer.done ? CHIP.done : CHIP.running
        )
        const content = (
          <>
            <HugeiconsIcon
              icon={Timer02Icon}
              strokeWidth={2}
              className="size-3.5"
            />
            <span className="tabular-nums">
              {timer.done
                ? t("cook.timers.done")
                : formatRemaining(timer.endsAt - now)}
            </span>
          </>
        )
        return (
          <li
            key={timer.id}
            role="timer"
            aria-label={t("cook.timers.label", { label: timer.label })}
          >
            {timer.cooking ? (
              <Link
                to="/recipes/$slug/cook"
                params={{ slug: timer.cooking.slug }}
                search={{
                  scale: timer.cooking.scale,
                  ...(timer.cooking.with ? { with: timer.cooking.with } : {}),
                }}
                className={style}
                title={timer.label}
              >
                {content}
              </Link>
            ) : (
              <span className={style} title={timer.label}>
                {content}
              </span>
            )}
          </li>
        )
      })}
      {list.length > 2 && (
        <li className="text-xs text-muted-foreground">
          {t("cook.timers.more", { count: list.length - 2 })}
        </li>
      )}
    </ul>
  )
}

const PRESETS = [1, 3, 5, 10, 15, 20, 30, 45, 60]
const MOST_MINUTES = 24 * 60

/** A timer for something the steps don't time, like resting the dough. */
export function NewTimerButton({ cooking }: { cooking: Cooking }) {
  const { t } = useTranslation()
  const [open, setOpen] = React.useState(false)
  const [minutes, setMinutes] = React.useState("")
  const typed = Number(minutes)
  const valid = typed > 0 && typed <= MOST_MINUTES

  function start(length: number) {
    const seconds = Math.round(length * 60)
    startTimer(formatDuration(t, seconds), seconds, cooking)
    setOpen(false)
    setMinutes("")
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="icon"
            aria-label={t("cook.timers.new")}
            title={t("cook.timers.new")}
          />
        }
      >
        <HugeiconsIcon icon={Timer02Icon} strokeWidth={2} />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[21rem] max-w-[calc(100vw-2rem)] gap-3"
      >
        <p className="text-sm font-medium">{t("cook.timers.new")}</p>
        <div className="grid grid-cols-3 gap-2">
          {PRESETS.map((length) => (
            <Button
              key={length}
              variant="secondary"
              size="sm"
              className="px-2"
              onClick={() => start(length)}
            >
              {formatDuration(t, length * 60)}
            </Button>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (valid) start(typed)
          }}
        >
          <Input
            type="number"
            inputMode="decimal"
            min={0.5}
            max={MOST_MINUTES}
            step="any"
            placeholder={t("cook.timers.minutes")}
            aria-label={t("cook.timers.minutes")}
            value={minutes}
            onChange={(event) => setMinutes(event.target.value)}
          />
          <Button type="submit" disabled={!valid}>
            {t("cook.timers.start")}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}
