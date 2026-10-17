import { Download04Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

/** A person's own data, as a file to keep. */
export function MyDataCard() {
  const { t } = useTranslation()
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.you.myData.title")}</CardTitle>
        <CardDescription>
          {t("settings.you.myData.description")}
        </CardDescription>
      </CardHeader>
      <CardFooter>
        <Button
          variant="outline"
          render={<a href="/api/auth/me/export" download />}
        >
          <HugeiconsIcon
            icon={Download04Icon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          {t("settings.you.myData.download")}
        </Button>
      </CardFooter>
    </Card>
  )
}
