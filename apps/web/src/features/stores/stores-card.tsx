import { Alert02Icon, Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { SALE_LEANS } from "@merran/shared"
import { useQuery } from "@tanstack/react-query"
import { getRouteApi } from "@tanstack/react-router"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useCapability } from "@/features/capabilities/queries"
import { api, ApiError, unwrap } from "@/lib/api/client"
import { formatRelativeDate } from "@/lib/format"
import { cn } from "@/lib/utils"

import {
  storesQuery,
  useSetStores,
  type StoreLocation,
  type StoresStatus,
} from "./queries"

const householdRoute = getRouteApi("/_app/settings/household")

type Modality = StoresStatus["kroger"]["modality"]
type Lean = StoresStatus["kroger"]["leanOnSales"]

/**
 * The household's Kroger (Fry's, Ralphs, King Soopers...): the store it
 * shops at, picked up or delivered, and the account the list goes to.
 */
export function StoresCard() {
  const { t, i18n } = useTranslation()
  const on = useCapability("stores.kroger")
  const { data } = useQuery({ ...storesQuery, enabled: on })
  const setStores = useSetStores()
  // What's going on: finding, linking, or the store being picked.
  const [busy, setBusy] = React.useState<string | null>(null)
  const [changing, setChanging] = React.useState(false)
  const [zip, setZip] = React.useState("")
  const [found, setFound] = React.useState<StoreLocation[] | null>(null)
  // The budget being typed; null shows the one saved.
  const [typedBudget, setBudget] = React.useState<string | null>(null)
  const id = React.useId()
  useLinkedToast()
  if (!on || !data) return null
  const kroger = data.kroger
  const choosing = changing || !kroger.location
  const savedBudget =
    kroger.weeklyBudget === null ? "" : String(kroger.weeklyBudget)
  const budget = typedBudget ?? savedBudget
  const budgetChanged = budget.trim() !== savedBudget
  // Kroger's prices are in dollars.
  const currencySymbol =
    new Intl.NumberFormat(i18n.language, {
      style: "currency",
      currency: "USD",
    })
      .formatToParts(0)
      .find((part) => part.type === "currency")?.value ?? "$"

  async function attempt<T>(what: string, work: () => Promise<T>) {
    setBusy(what)
    try {
      return await work()
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
      return null
    } finally {
      setBusy(null)
    }
  }

  async function find() {
    const zipCode = zip.trim()
    if (!/^\d{5}$/.test(zipCode)) {
      toast.error(t("settings.household.stores.zipNeeded"))
      return
    }
    const answer = await attempt("find", () =>
      unwrap(
        api.GET("/api/stores/kroger/locations", {
          params: { query: { zip: zipCode } },
        })
      )
    )
    if (answer) setFound(answer.locations)
  }

  async function change(body: { locationId?: string; modality?: Modality }) {
    const status = await attempt(body.locationId ?? "modality", () =>
      unwrap(api.PUT("/api/stores/kroger", { body }))
    )
    if (!status) return
    setStores(status)
    if (body.locationId) {
      setChanging(false)
      setFound(null)
      toast.success(
        t("settings.household.stores.picked", {
          store: status.kroger.location?.name,
        })
      )
    }
  }

  async function link() {
    const answer = await attempt("link", () =>
      unwrap(api.POST("/api/stores/kroger/link"))
    )
    // Kroger asks the person to sign in, then sends them back here.
    if (answer) window.location.assign(answer.url)
  }

  /** How much Fill the week and the autoplan lean on deals. */
  async function lean(value: Lean) {
    const saved = await attempt("lean", () =>
      unwrap(
        api.PATCH("/api/settings/household", {
          body: { "stores.leanOnSales": value },
        })
      )
    )
    if (saved) setStores({ kroger: { ...kroger, leanOnSales: value } })
  }

  /** Today's prices and sales now, rather than tomorrow morning. */
  /** The weekly budget, or none when it's left empty. */
  async function saveBudget() {
    const typed = budget.trim().replace(/[^\d.]/g, "")
    const value = typed ? Number(typed) : null
    if (value !== null && !(value > 0)) {
      toast.error(t("settings.household.stores.budgetHint"))
      return
    }
    const saved = await attempt("budget", () =>
      unwrap(
        api.PATCH("/api/settings/household", {
          body: { "stores.weeklyBudget": value },
        })
      )
    )
    if (!saved) return
    setBudget(null)
    setStores({ kroger: { ...kroger, weeklyBudget: value } })
    toast.success(
      value === null
        ? t("settings.household.stores.budgetCleared")
        : t("settings.household.stores.budgetSaved")
    )
  }

  async function checkNow() {
    const check = await attempt("check", () =>
      unwrap(api.POST("/api/stores/kroger/prices"))
    )
    if (!check) return
    setStores({
      kroger: { ...kroger, pricesCheckedAt: new Date().toISOString() },
    })
    toast.success(
      t("settings.household.stores.checkedNow", { count: check.deals })
    )
  }

  async function unlink() {
    const done = await attempt("unlink", async () => {
      await unwrap(api.DELETE("/api/stores/kroger/link"))
      return true
    })
    if (!done) return
    setStores({ kroger: { ...kroger, linked: null, needsRelink: false } })
    toast.success(t("settings.household.stores.unlinked"))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.household.stores.title")}</CardTitle>
        <CardDescription>
          {t("settings.household.stores.description")}
        </CardDescription>
        <CardAction>
          <Badge variant={kroger.location ? "default" : "secondary"}>
            {kroger.location?.banner ?? t("common.off")}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          {kroger.needsRelink && (
            <Alert variant="destructive">
              <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} />
              <AlertTitle>
                {t("settings.household.stores.relinkTitle")}
              </AlertTitle>
              <AlertDescription>
                {t("settings.household.stores.relinkHint")}
              </AlertDescription>
            </Alert>
          )}

          <Field>
            <FieldLabel>{t("settings.household.stores.store")}</FieldLabel>
            {kroger.location && !changing && (
              <div className="flex items-center justify-between gap-3 rounded-xl border p-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{kroger.location.name}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {kroger.location.address}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setChanging(true)}
                >
                  {t("settings.household.stores.change")}
                </Button>
              </div>
            )}
            {choosing && (
              <>
                <form
                  noValidate
                  onSubmit={(event) => {
                    event.preventDefault()
                    void find()
                  }}
                >
                  <InputGroup>
                    <InputGroupInput
                      inputMode="numeric"
                      autoComplete="postal-code"
                      maxLength={5}
                      placeholder={t("settings.household.stores.zip")}
                      aria-label={t("settings.household.stores.zip")}
                      value={zip}
                      onChange={(event) => setZip(event.target.value)}
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupButton
                        type="submit"
                        disabled={busy !== null}
                        aria-label={t("settings.household.stores.find")}
                      >
                        {busy === "find" ? (
                          <Spinner />
                        ) : (
                          <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
                        )}
                        {t("settings.household.stores.find")}
                      </InputGroupButton>
                    </InputGroupAddon>
                  </InputGroup>
                </form>
                {found && found.length === 0 && (
                  <FieldDescription>
                    {t("settings.household.stores.noneNear")}
                  </FieldDescription>
                )}
                {found && found.length > 0 && (
                  <ul className="grid gap-2">
                    {found.map((location) => (
                      <li key={location.locationId}>
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() =>
                            void change({ locationId: location.locationId })
                          }
                          className={cn(
                            "flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-muted",
                            location.locationId ===
                              kroger.location?.locationId && "border-primary"
                          )}
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium">
                              {location.name}
                            </span>
                            <span className="block truncate text-sm text-muted-foreground">
                              {location.address}
                            </span>
                          </span>
                          {busy === location.locationId ? (
                            <Spinner />
                          ) : (
                            <Badge variant="secondary">{location.banner}</Badge>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {changing && (
                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setChanging(false)
                        setFound(null)
                      }}
                    >
                      {t("common.cancel")}
                    </Button>
                  </div>
                )}
              </>
            )}
            {!kroger.location && (
              <FieldDescription>
                {t("settings.household.stores.storeHint")}
              </FieldDescription>
            )}
          </Field>

          {kroger.location && (
            <Field>
              <FieldLabel>{t("settings.household.stores.modality")}</FieldLabel>
              <ToggleGroup
                variant="outline"
                size="sm"
                value={[kroger.modality]}
                onValueChange={(value) => {
                  const picked = value[0] as Modality | undefined
                  if (picked && picked !== kroger.modality) {
                    void change({ modality: picked })
                  }
                }}
                disabled={busy !== null}
                className="justify-start"
              >
                <ToggleGroupItem value="PICKUP">
                  {t("settings.household.stores.pickup")}
                </ToggleGroupItem>
                <ToggleGroupItem value="DELIVERY">
                  {t("settings.household.stores.delivery")}
                </ToggleGroupItem>
              </ToggleGroup>
              <FieldDescription>
                {t("settings.household.stores.modalityHint")}
              </FieldDescription>
            </Field>
          )}

          {kroger.location && (
            <Field>
              <FieldLabel>{t("settings.household.stores.lean")}</FieldLabel>
              <ToggleGroup
                variant="outline"
                size="sm"
                value={[kroger.leanOnSales]}
                onValueChange={(value) => {
                  const picked = value[0] as Lean | undefined
                  if (picked && picked !== kroger.leanOnSales) {
                    void lean(picked)
                  }
                }}
                disabled={busy !== null}
                className="justify-start"
              >
                {SALE_LEANS.map((option) => (
                  <ToggleGroupItem key={option} value={option}>
                    {t(`settings.household.stores.leans.${option}`)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <FieldDescription className="min-w-0 flex-1">
                  {kroger.pricesCheckedAt
                    ? t("settings.household.stores.checked", {
                        when: formatRelativeDate(
                          kroger.pricesCheckedAt,
                          i18n.language
                        ),
                      })
                    : t("settings.household.stores.leanHint")}
                </FieldDescription>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => void checkNow()}
                >
                  {busy === "check" && <Spinner />}
                  {t("settings.household.stores.checkNow")}
                </Button>
              </div>
            </Field>
          )}

          {kroger.location && (
            <Field>
              <FieldLabel htmlFor={`${id}-budget`}>
                {t("settings.household.stores.budget")}
              </FieldLabel>
              <form
                noValidate
                className="flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  void saveBudget()
                }}
              >
                <InputGroup className="max-w-40">
                  <InputGroupAddon>
                    <InputGroupText>{currencySymbol}</InputGroupText>
                  </InputGroupAddon>
                  <InputGroupInput
                    id={`${id}-budget`}
                    inputMode="decimal"
                    value={budget}
                    onChange={(event) => setBudget(event.target.value)}
                  />
                </InputGroup>
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  className="self-center"
                  disabled={busy !== null || !budgetChanged}
                >
                  {busy === "budget" && <Spinner />}
                  {t("common.save")}
                </Button>
              </form>
              <FieldDescription>
                {t("settings.household.stores.budgetHint")}
              </FieldDescription>
            </Field>
          )}

          <Field>
            <FieldLabel>{t("settings.household.stores.account")}</FieldLabel>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <FieldDescription className="min-w-0 flex-1">
                {kroger.linked
                  ? kroger.linked.by
                    ? t("settings.household.stores.linkedBy", {
                        by: kroger.linked.by,
                        when: formatRelativeDate(
                          kroger.linked.at,
                          i18n.language
                        ),
                      })
                    : t("settings.household.stores.linked", {
                        when: formatRelativeDate(
                          kroger.linked.at,
                          i18n.language
                        ),
                      })
                  : t("settings.household.stores.accountHint", {
                      store: kroger.location?.banner ?? "Kroger",
                    })}
              </FieldDescription>
              <div className="flex gap-2">
                {kroger.linked && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy !== null}
                    onClick={() => void unlink()}
                  >
                    {busy === "unlink" && <Spinner />}
                    {t("settings.household.stores.unlink")}
                  </Button>
                )}
                {(!kroger.linked || kroger.needsRelink) && (
                  <Button
                    size="sm"
                    disabled={busy !== null}
                    onClick={() => void link()}
                  >
                    {busy === "link" && <Spinner />}
                    {kroger.needsRelink
                      ? t("settings.household.stores.relink")
                      : t("settings.household.stores.link", {
                          store: kroger.location?.banner ?? "Kroger",
                        })}
                  </Button>
                )}
              </div>
            </div>
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  )
}

/** Says how linking went, when Kroger sends the person back here. */
function useLinkedToast() {
  const { t } = useTranslation()
  const { kroger, reason } = householdRoute.useSearch()
  const navigate = householdRoute.useNavigate()
  React.useEffect(() => {
    if (!kroger) return
    if (kroger === "linked")
      toast.success(t("settings.household.stores.didLink"))
    else if (kroger === "cancelled") {
      toast(t("settings.household.stores.cancelled"))
    } else {
      toast.error(reason || t("settings.household.stores.failed"))
    }
    void navigate({ search: {}, replace: true })
  }, [kroger, reason, navigate, t])
}
