import { Delete02Icon, Logout03Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/confirm-dialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { meQuery } from "@/features/auth/queries"
import { useMe, useRefreshAll } from "@/features/auth/use-me"
import { api, ApiError, unwrap } from "@/lib/api/client"
import { formatDate } from "@/lib/format"
import { initials } from "@/lib/initials"

import {
  householdQuery,
  isAdminRole,
  membersQuery,
  type HouseholdRole,
  type Member,
} from "./queries"

/** Who's in the household. Admins can change roles and remove people. */
export function MembersCard() {
  const { t } = useTranslation()
  const { data: members } = useSuspenseQuery(membersQuery)
  const { data: household } = useSuspenseQuery(householdQuery)
  const owners = members.filter((member) => member.role === "owner").length

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.household.members.title")}</CardTitle>
        <CardDescription>
          {t("settings.household.members.description", {
            count: members.length,
          })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y rounded-2xl border">
          {members.map((member) => (
            <MemberRow
              key={member.id}
              member={member}
              myRole={household.role}
              lastOwner={member.role === "owner" && owners === 1}
            />
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function MemberRow({
  member,
  myRole,
  lastOwner,
}: {
  member: Member
  myRole: HouseholdRole
  /** The household always keeps an owner, so the last one can't leave. */
  lastOwner: boolean
}) {
  const { t, i18n } = useTranslation()
  const me = useMe()
  const queryClient = useQueryClient()
  const refreshAll = useRefreshAll()
  const navigate = useNavigate()
  const isMe = member.userId === me.id
  const amAdmin = isAdminRole(myRole)
  // Only owners can make or unmake owners.
  const canChangeRole =
    amAdmin && !isMe && (myRole === "owner" || member.role !== "owner")
  const roles: HouseholdRole[] =
    myRole === "owner" ? ["owner", "admin", "member"] : ["admin", "member"]
  const roleOptions = roles.map((value) => ({
    value,
    label: t(`settings.household.roles.${value}`),
  }))

  async function changeRole(role: HouseholdRole) {
    try {
      await unwrap(
        api.PATCH("/api/households/current/members/{memberId}", {
          params: { path: { memberId: member.id } },
          body: { role },
        })
      )
      await queryClient.invalidateQueries({ queryKey: membersQuery.queryKey })
      toast.success(
        t("settings.household.members.roleChanged", { name: member.name })
      )
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      toast.error(error.message)
    }
  }

  async function remove() {
    try {
      await unwrap(
        api.DELETE("/api/households/current/members/{memberId}", {
          params: { path: { memberId: member.id } },
        })
      )
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      toast.error(error.message)
      return
    }
    if (isMe) {
      toast.success(t("settings.household.members.left"))
      await refreshAll()
      await navigate({ to: "/" })
    } else {
      await queryClient.invalidateQueries({ queryKey: membersQuery.queryKey })
      await queryClient.invalidateQueries({ queryKey: meQuery.queryKey })
      toast.success(
        t("settings.household.members.removed", { name: member.name })
      )
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-3 p-4">
      <Avatar>
        <AvatarFallback className="bg-accent text-accent-foreground">
          {initials(member.name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1 basis-48">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium">{member.name}</span>
          {isMe && (
            <Badge variant="outline">
              {t("settings.household.members.you")}
            </Badge>
          )}
        </div>
        <p className="truncate text-sm text-muted-foreground">
          {[
            member.username && `@${member.username}`,
            t("settings.household.members.joined", {
              date: formatDate(member.joinedAt, i18n.language),
            }),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <div className="ml-auto flex items-center gap-2">
        {canChangeRole ? (
          <Select
            items={roleOptions}
            value={member.role}
            onValueChange={(role) => {
              if (role && role !== member.role) void changeRole(role)
            }}
          >
            <SelectTrigger
              size="sm"
              aria-label={t("settings.household.members.role", {
                name: member.name,
              })}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {roleOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Badge variant="secondary">
            {t(`settings.household.roles.${member.role}`)}
          </Badge>
        )}
        {isMe
          ? !lastOwner && (
              <ConfirmDialog
                trigger={
                  <Button variant="outline" size="sm">
                    <HugeiconsIcon icon={Logout03Icon} strokeWidth={2} />
                    {t("settings.household.members.leave")}
                  </Button>
                }
                title={t("settings.household.members.leaveTitle")}
                description={t("settings.household.members.leaveDescription")}
                confirm={t("settings.household.members.leave")}
                onConfirm={remove}
              />
            )
          : canChangeRole && (
              <ConfirmDialog
                trigger={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("settings.household.members.remove", {
                      name: member.name,
                    })}
                  >
                    <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                  </Button>
                }
                title={t("settings.household.members.removeTitle", {
                  name: member.name,
                })}
                description={t("settings.household.members.removeDescription")}
                confirm={t("settings.household.members.removeConfirm")}
                onConfirm={remove}
              />
            )}
      </div>
    </li>
  )
}
