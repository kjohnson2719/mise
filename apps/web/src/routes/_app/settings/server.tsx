import { createFileRoute, redirect } from "@tanstack/react-router"

import { meQuery } from "@/features/auth/queries"
import {
  ServerAiKeysCard,
  ServerAiPolicyCard,
  ServerAiSpendCard,
} from "@/features/ai/server-ai-cards"
import { serverAiQuery } from "@/features/ai/queries"
import { AboutCard } from "@/features/server/about-card"
import { ErrorTrackingCard } from "@/features/server/error-tracking-card"
import { JobsCard, serverJobsQuery } from "@/features/server/jobs-card"
import { KrogerCard } from "@/features/server/kroger-card"
import { NutritionCard } from "@/features/server/nutrition-card"
import { PhotosCard } from "@/features/server/photos-card"
import { SitesCard } from "@/features/server/sites-card"
import { VoiceCard } from "@/features/server/voice-card"
import {
  serverSettingsQuery,
  telemetryReportQuery,
} from "@/features/server/queries"
import { TelemetryCard } from "@/features/server/telemetry-card"
import { VideoCard } from "@/features/server/video-card"
import { WalmartCard } from "@/features/server/walmart-card"

export const Route = createFileRoute("/_app/settings/server")({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery)
    if (!me?.serverAdmin) throw redirect({ to: "/settings/you" })
  },
  loader: ({ context: { queryClient } }) =>
    Promise.all([
      queryClient.ensureQueryData(serverSettingsQuery),
      queryClient.ensureQueryData(telemetryReportQuery),
      queryClient.ensureQueryData(serverJobsQuery),
      queryClient.ensureQueryData(serverAiQuery),
    ]),
  component: ServerSettings,
})

function ServerSettings() {
  return (
    <>
      <AboutCard />
      <ServerAiKeysCard />
      <ServerAiPolicyCard />
      <ServerAiSpendCard />
      <VideoCard />
      <NutritionCard />
      <SitesCard />
      <PhotosCard />
      <VoiceCard />
      <KrogerCard />
      <WalmartCard />
      <ErrorTrackingCard />
      <TelemetryCard />
      <JobsCard />
    </>
  )
}
