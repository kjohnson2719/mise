import { PlayIcon, StopIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  queryOptions,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { LockedNote } from "@/features/settings/setting-fields"
import { api, ApiError, unwrap, type Schemas } from "@/lib/api/client"
import { cn } from "@/lib/utils"

import { serverSettingsQuery, useSaveServerSettings } from "./queries"

type VoiceSettings = Schemas["VoiceSettings"]
type Provider = VoiceSettings["provider"]

const PROVIDERS = ["device", "kokoro", "openai"] as const

export const serverVoiceQuery = queryOptions({
  queryKey: ["settings", "server", "voice"],
  queryFn: () => unwrap(api.GET("/api/settings/server/voice")),
})

/**
 * The server voice: cook steps read by each device's own voice, Kokoro or
 * OpenAI, with each voice to hear before it's picked.
 */
export function VoiceCard() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data: settings } = useSuspenseQuery(serverSettingsQuery)
  const { data: voice } = useQuery(serverVoiceQuery)
  const save = useSaveServerSettings()
  const [saving, setSaving] = React.useState<string | null>(null)
  const state = (key: string) => settings.settings.find((s) => s.key === key)
  const providerState = state("voice.provider")
  const urlState = state("voice.kokoroUrl")
  const [url, setUrl] = React.useState("")
  React.useEffect(() => {
    if (voice) setUrl(voice.kokoroUrl ?? "")
  }, [voice?.kokoroUrl])

  async function change(changes: Record<string, unknown>, what: string) {
    setSaving(what)
    try {
      await save(changes)
      await queryClient.invalidateQueries({
        queryKey: serverVoiceQuery.queryKey,
      })
      toast.success(t("settings.server.saved"))
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      toast.error(error.message)
    } finally {
      setSaving(null)
    }
  }

  const provider = voice?.provider ?? "device"

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.server.voice.title")}</CardTitle>
        <CardDescription>
          {t("settings.server.voice.description")}
        </CardDescription>
        <CardAction>
          <Badge variant={provider !== "device" ? "default" : "secondary"}>
            {t(`settings.server.voice.providers.${provider}`)}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-5 text-sm">
        {!voice ? (
          <Spinner />
        ) : (
          <>
            <div className="grid gap-2">
              <ToggleGroup
                variant="outline"
                value={[provider]}
                disabled={saving !== null || Boolean(providerState?.lockedBy)}
                onValueChange={(value) => {
                  const next = value[0] as Provider | undefined
                  if (next && next !== provider) {
                    void change({ "voice.provider": next }, "provider")
                  }
                }}
                aria-label={t("settings.server.voice.who")}
                className="w-full"
              >
                {PROVIDERS.map((option) => (
                  <ToggleGroupItem
                    key={option}
                    value={option}
                    className="flex-1"
                  >
                    {t(`settings.server.voice.providers.${option}`)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <p className="text-muted-foreground">
                {providerState?.lockedBy ? (
                  <LockedNote state={providerState} />
                ) : (
                  t(`settings.server.voice.hints.${provider}`)
                )}
              </p>
            </div>

            {provider === "kokoro" && (
              <>
                <form
                  className="grid gap-2"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void change(
                      { "voice.kokoroUrl": url.trim() || null },
                      "url"
                    )
                  }}
                >
                  <label htmlFor="kokoro-url" className="font-medium">
                    {t("settings.server.voice.kokoroUrl")}
                  </label>
                  <div className="flex gap-2">
                    <Input
                      id="kokoro-url"
                      value={url}
                      inputMode="url"
                      placeholder="http://kokoro:8880"
                      disabled={Boolean(urlState?.lockedBy)}
                      onChange={(event) => setUrl(event.target.value)}
                    />
                    <Button
                      type="submit"
                      variant="outline"
                      disabled={
                        saving !== null ||
                        Boolean(urlState?.lockedBy) ||
                        url.trim() === (voice.kokoroUrl ?? "")
                      }
                    >
                      {saving === "url" && <Spinner data-icon="inline-start" />}
                      {t("common.save")}
                    </Button>
                  </div>
                  <p className="text-muted-foreground">
                    {urlState?.lockedBy ? (
                      <LockedNote state={urlState} />
                    ) : (
                      t("settings.server.voice.kokoroUrlHint")
                    )}
                  </p>
                </form>
                {voice.kokoro.error ? (
                  <p className="text-destructive" role="status">
                    {voice.kokoro.error}
                  </p>
                ) : (
                  voice.kokoro.voices.length > 0 && (
                    <KokoroVoices
                      voices={voice.kokoro.voices}
                      chosen={voice.voices.kokoro}
                      disabled={saving !== null}
                      onPick={(id) =>
                        void change({ "voice.kokoroVoice": id }, "voice")
                      }
                    />
                  )
                )}
              </>
            )}

            {provider === "openai" && (
              <div className="grid gap-2">
                <p className="text-muted-foreground">
                  {t("settings.server.voice.openaiHint")}
                </p>
                <VoiceList
                  provider="openai"
                  voices={voice.openai.map((option) => ({
                    id: option.id,
                    name: option.name,
                    about: null,
                  }))}
                  chosen={voice.voices.openai}
                  disabled={saving !== null}
                  onPick={(id) =>
                    void change({ "voice.openaiVoice": id }, "voice")
                  }
                />
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

/** Kokoro's voices: English ones, then the rest folded away. */
function KokoroVoices({
  voices,
  chosen,
  disabled,
  onPick,
}: {
  voices: VoiceSettings["kokoro"]["voices"]
  chosen: string
  disabled: boolean
  onPick: (id: string) => void
}) {
  const { t } = useTranslation()
  const describe = (voice: (typeof voices)[number]) => ({
    id: voice.id,
    name: voice.name,
    about: [
      voice.accent,
      voice.gender && t(`settings.server.voice.genders.${voice.gender}`),
    ]
      .filter(Boolean)
      .join(" · "),
  })
  const english = voices.filter((voice) => voice.english).map(describe)
  const others = voices.filter((voice) => !voice.english).map(describe)

  return (
    <div className="grid gap-3">
      <VoiceList
        provider="kokoro"
        voices={english}
        chosen={chosen}
        disabled={disabled}
        onPick={onPick}
      />
      {others.length > 0 && (
        <Collapsible defaultOpen={others.some((voice) => voice.id === chosen)}>
          <CollapsibleTrigger
            render={<Button variant="ghost" size="sm" className="-ml-2" />}
          >
            {t("settings.server.voice.otherLanguages", {
              count: others.length,
            })}
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <VoiceList
              provider="kokoro"
              voices={others}
              chosen={chosen}
              disabled={disabled}
              onPick={onPick}
            />
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  )
}

/** Voices to pick from, each with a sample to hear first. */
function VoiceList({
  provider,
  voices,
  chosen,
  disabled,
  onPick,
}: {
  provider: "kokoro" | "openai"
  voices: { id: string; name: string; about: string | null }[]
  chosen: string
  disabled: boolean
  onPick: (id: string) => void
}) {
  const { t } = useTranslation()
  const [playing, setPlaying] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState<string | null>(null)
  const player = React.useRef<HTMLAudioElement | null>(null)
  React.useEffect(() => () => player.current?.pause(), [])

  async function hear(id: string) {
    player.current?.pause()
    if (playing === id) {
      setPlaying(null)
      return
    }
    setLoading(id)
    try {
      const { data, error } = await api.POST(
        "/api/settings/server/voice/preview",
        { body: { provider, voice: id }, parseAs: "blob" }
      )
      if (error || !(data instanceof Blob)) {
        toast.error(t("settings.server.voice.previewFailed"))
        return
      }
      const audio = new Audio(URL.createObjectURL(data))
      player.current = audio
      audio.onended = () => setPlaying(null)
      setPlaying(id)
      await audio.play()
    } catch {
      toast.error(t("settings.server.voice.previewFailed"))
      setPlaying(null)
    } finally {
      setLoading(null)
    }
  }

  return (
    <ul
      className="grid gap-1.5 sm:grid-cols-2"
      role="radiogroup"
      aria-label={t("settings.server.voice.voices")}
    >
      {voices.map((voice) => {
        const picked = voice.id === chosen
        return (
          <li
            key={voice.id}
            className={cn(
              "flex items-center gap-2 rounded-2xl border p-1.5 pl-3",
              picked && "border-primary bg-primary/5"
            )}
          >
            <button
              type="button"
              role="radio"
              aria-checked={picked}
              disabled={disabled}
              onClick={() => onPick(voice.id)}
              className="grid min-w-0 flex-1 text-left outline-none focus-visible:underline"
            >
              <span className="truncate font-medium">{voice.name}</span>
              {voice.about && (
                <span className="truncate text-xs text-muted-foreground">
                  {voice.about}
                </span>
              )}
            </button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t("settings.server.voice.hear", { name: voice.name })}
              onClick={() => void hear(voice.id)}
            >
              {loading === voice.id ? (
                <Spinner />
              ) : (
                <HugeiconsIcon
                  icon={playing === voice.id ? StopIcon : PlayIcon}
                  strokeWidth={2}
                />
              )}
            </Button>
          </li>
        )
      })}
    </ul>
  )
}
