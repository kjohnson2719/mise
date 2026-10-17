import { Add01Icon, Cancel01Icon, Link01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { CopyField } from "@/components/form/copy-field"
import { SelectField } from "@/components/form/select-field"
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
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Spinner } from "@/components/ui/spinner"
import { api, ApiError, unwrap } from "@/lib/api/client"
import { formatDate } from "@/lib/format"

import { invitesQuery, type InviteLink } from "./queries"

/** Links that let someone join the household. Admins only. */
export function InvitesCard() {
  const { t } = useTranslation()
  const { data: invites } = useSuspenseQuery(invitesQuery)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.household.invites.title")}</CardTitle>
        <CardDescription>
          {t("settings.household.invites.description")}
        </CardDescription>
        <CardAction>
          <NewInviteDialog />
        </CardAction>
      </CardHeader>
      <CardContent>
        {invites.length === 0 ? (
          <Empty className="rounded-2xl border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={Link01Icon} strokeWidth={2} />
              </EmptyMedia>
              <EmptyTitle>{t("settings.household.invites.none")}</EmptyTitle>
              <EmptyDescription>
                {t("settings.household.invites.noneHint")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="divide-y rounded-2xl border">
            {invites.map((invite) => (
              <InviteRow key={invite.id} invite={invite} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function InviteRow({ invite }: { invite: InviteLink }) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [busy, setBusy] = React.useState(false)

  async function cancel() {
    setBusy(true)
    try {
      await unwrap(
        api.DELETE("/api/households/current/invites/{inviteId}", {
          params: { path: { inviteId: invite.id } },
        })
      )
      await queryClient.invalidateQueries({ queryKey: invitesQuery.queryKey })
      toast.success(t("settings.household.invites.cancelled"))
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      toast.error(error.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="flex items-center gap-3 p-4">
      <div className="min-w-0 flex-1 space-y-1">
        <Badge variant="secondary">
          {t(`settings.household.roles.${invite.role}`)}
        </Badge>
        <p className="text-sm text-muted-foreground">
          {[
            t("settings.household.invites.made", {
              date: formatDate(invite.createdAt, i18n.language),
            }),
            t("settings.household.invites.expires", {
              date: formatDate(invite.expiresAt, i18n.language),
            }),
          ].join(" · ")}
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={cancel} disabled={busy}>
        {busy ? (
          <Spinner />
        ) : (
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
        )}
        {t("settings.household.invites.cancel")}
      </Button>
    </li>
  )
}

function NewInviteDialog() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [open, setOpen] = React.useState(false)
  const [role, setRole] = React.useState<InviteLink["role"]>("member")
  const [link, setLink] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  const roleOptions = (["member", "admin"] as const).map((value) => ({
    value,
    label: t(`settings.household.roles.${value}`),
  }))

  async function make(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      const made = await unwrap(
        api.POST("/api/households/current/invites", { body: { role } })
      )
      await queryClient.invalidateQueries({ queryKey: invitesQuery.queryKey })
      setLink(made.link)
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      toast.error(error.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setLink(null)
          setRole("member")
        }
      }}
    >
      <DialogTrigger
        render={
          <Button size="sm">
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
            {t("settings.household.invites.make")}
          </Button>
        }
      />
      <DialogContent>
        {link ? (
          <>
            <DialogHeader>
              <DialogTitle>
                {t("settings.household.invites.madeTitle")}
              </DialogTitle>
              <DialogDescription>
                {t("settings.household.invites.madeDescription")}
              </DialogDescription>
            </DialogHeader>
            <CopyField
              label={t("settings.household.invites.link")}
              value={link}
            />
            <DialogFooter>
              <DialogClose render={<Button />}>{t("common.done")}</DialogClose>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={make} className="grid gap-6">
            <DialogHeader>
              <DialogTitle>{t("settings.household.invites.make")}</DialogTitle>
              <DialogDescription>
                {t("settings.household.invites.makeDescription")}
              </DialogDescription>
            </DialogHeader>
            <SelectField
              label={t("settings.household.invites.role")}
              description={t("settings.household.invites.roleHint")}
              value={role}
              onChange={setRole}
              options={roleOptions}
            />
            <DialogFooter>
              <DialogClose render={<Button variant="outline" type="button" />}>
                {t("common.cancel")}
              </DialogClose>
              <Button type="submit" disabled={busy}>
                {busy && <Spinner />}
                {t("settings.household.invites.makeSubmit")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
