import { useQuery } from "@tanstack/react-query"

import { useCapability } from "@/features/capabilities/queries"
import { api, unwrap } from "@/lib/api/client"

// The server voice: Kokoro or OpenAI reading cook steps, the same on every
// device (Settings, This server, Voice). Each reading is fetched once and
// kept for the visit; the next step is fetched while this one is read.

/** How long to wait for a reading before the device reads instead. */
const WAIT_MS = 8000

/** Readings fetched this visit, as addresses to play, by the words. */
const readings = new Map<string, Promise<string | null>>()

function fetchReading(text: string) {
  let found = readings.get(text)
  if (!found) {
    found = api
      .POST("/api/voice/speak", { body: { text }, parseAs: "blob" })
      .then(({ data }) =>
        data instanceof Blob && data.size > 0 ? URL.createObjectURL(data) : null
      )
      .catch(() => null)
    readings.set(text, found)
    // One that didn't come is asked for again next time.
    void found.then((url) => {
      if (!url) readings.delete(text)
    })
  }
  return found
}

/** A reading to play, or null if it doesn't come soon enough. */
export function serverReading(text: string): Promise<string | null> {
  return Promise.race([
    fetchReading(text),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), WAIT_MS)),
  ])
}

/** Fetches a reading ahead, for the next step. */
export function readAhead(text: string) {
  void fetchReading(text)
}

/** Whether the server reads aloud for this household. */
export function useServerVoice() {
  const capable = useCapability("voice")
  const { data } = useQuery({
    queryKey: ["voice"],
    queryFn: () => unwrap(api.GET("/api/voice")),
    enabled: capable,
    staleTime: 5 * 60_000,
  })
  return capable && data?.on === true
}

/** A moment of silence, played from a tap so the phone lets later readings play. */
export const SILENCE =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA="
