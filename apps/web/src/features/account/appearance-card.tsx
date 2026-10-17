import { useTranslation } from "react-i18next"

import { ModeToggleGroup } from "@/components/theme/mode-toggle"
import { PalettePicker } from "@/components/theme/palette-picker"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { FieldGroup, FieldSet, FieldLegend } from "@/components/ui/field"

/** Light or dark, and the colors. Kept on this device only. */
export function AppearanceCard() {
  const { t } = useTranslation()
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("theme.appearance")}</CardTitle>
        <CardDescription>
          {t("settings.you.appearance.description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <FieldSet>
            <FieldLegend variant="label">{t("theme.mode")}</FieldLegend>
            <ModeToggleGroup />
          </FieldSet>
          <FieldSet>
            <FieldLegend variant="label">{t("theme.palette")}</FieldLegend>
            <PalettePicker />
          </FieldSet>
        </FieldGroup>
      </CardContent>
    </Card>
  )
}
