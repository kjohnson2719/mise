import { createFileRoute } from "@tanstack/react-router"

import { ApiKeysCard } from "@/features/account/api-keys-card"
import { AppearanceCard } from "@/features/account/appearance-card"
import { MyDataCard } from "@/features/account/my-data-card"
import { PasswordCard } from "@/features/account/password-card"
import { ProfileCard } from "@/features/account/profile-card"
import { apiKeysQuery } from "@/features/account/queries"
import { InstallCard } from "@/features/install/install-ui"
import { ShareCard } from "@/features/share/share-card"

export const Route = createFileRoute("/_app/settings/you")({
  loader: ({ context }) => context.queryClient.ensureQueryData(apiKeysQuery),
  component: YouSettings,
})

function YouSettings() {
  return (
    <>
      <ProfileCard />
      <PasswordCard />
      <AppearanceCard />
      <InstallCard />
      <ShareCard />
      <ApiKeysCard />
      <MyDataCard />
    </>
  )
}
