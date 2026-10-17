import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query"
import * as React from "react"
import { Controller, useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { SelectField } from "@/components/form/select-field"
import { TextField } from "@/components/form/text-field"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { FieldGroup } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { meQuery } from "@/features/auth/queries"
import { api, unwrap } from "@/lib/api/client"
import { weekdayNames } from "@/lib/format"
import { showFormError } from "@/lib/form-errors"

import { householdQuery, isAdminRole } from "./queries"

type Form = { name: string; timeZone: string; weekStartsOn: number }

/** The household's name, time zone and first day of the week. */
export function DetailsCard() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const { data: household } = useSuspenseQuery(householdQuery)
  const canEdit = isAdminRole(household.role)

  const form = useForm<Form>({
    values: {
      name: household.name,
      timeZone: household.timeZone,
      weekStartsOn: household.weekStartsOn,
    },
  })
  const { errors, isSubmitting, isDirty } = form.formState

  const timeZones = React.useMemo(() => {
    const zones = new Set(Intl.supportedValuesOf("timeZone"))
    zones.add("UTC")
    zones.add(household.timeZone)
    return [...zones]
      .sort()
      .map((zone) => ({ value: zone, label: zone.replaceAll("_", " ") }))
  }, [household.timeZone])

  const weekdays = weekdayNames(i18n.language).map((label, value) => ({
    value,
    label,
  }))

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const saved = await unwrap(
        api.PATCH("/api/households/current", { body: values })
      )
      queryClient.setQueryData(householdQuery.queryKey, saved)
      await queryClient.invalidateQueries({ queryKey: meQuery.queryKey })
      toast.success(t("settings.household.details.saved"))
    } catch (error) {
      if (!showFormError(form.setError, error)) throw error
    }
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.household.details.title")}</CardTitle>
        <CardDescription>
          {canEdit
            ? t("settings.household.details.description")
            : t("settings.household.details.adminsOnly")}
        </CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit} noValidate>
        <CardContent>
          <FieldGroup>
            {errors.root && (
              <Alert variant="destructive">
                <AlertDescription>{errors.root.message}</AlertDescription>
              </Alert>
            )}
            <TextField
              label={t("settings.household.details.name")}
              disabled={!canEdit}
              error={errors.name?.message}
              {...form.register("name", {
                validate: (value) =>
                  value.trim() !== "" ||
                  t("settings.household.details.nameNeeded"),
              })}
            />
            <div className="grid gap-6 sm:grid-cols-2">
              <Controller
                control={form.control}
                name="timeZone"
                render={({ field }) => (
                  <SelectField
                    label={t("settings.household.details.timeZone")}
                    description={t("settings.household.details.timeZoneHint")}
                    value={field.value}
                    onChange={field.onChange}
                    options={timeZones}
                    disabled={!canEdit}
                    error={errors.timeZone?.message}
                  />
                )}
              />
              <Controller
                control={form.control}
                name="weekStartsOn"
                render={({ field }) => (
                  <SelectField
                    label={t("settings.household.details.weekStartsOn")}
                    description={t(
                      "settings.household.details.weekStartsOnHint"
                    )}
                    value={field.value}
                    onChange={field.onChange}
                    options={weekdays}
                    disabled={!canEdit}
                    error={errors.weekStartsOn?.message}
                  />
                )}
              />
            </div>
          </FieldGroup>
        </CardContent>
        {canEdit && (
          <CardFooter className="mt-6 justify-end">
            <Button type="submit" disabled={!isDirty || isSubmitting}>
              {isSubmitting && <Spinner />}
              {t("common.save")}
            </Button>
          </CardFooter>
        )}
      </form>
    </Card>
  )
}
