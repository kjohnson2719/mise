import {
  AiMagicIcon,
  ArrowLeft01Icon,
  Cancel01Icon,
  Delete02Icon,
  PencilEdit02Icon,
  TimeQuarterPassIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import type { UIMessage } from "ai"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { NeedsAi, useAiFor } from "@/features/ai/needs-ai"
import { useIsMobile } from "@/hooks/use-mobile"
import { useCapability } from "@/features/capabilities/queries"
import { api, ApiError, unwrap } from "@/lib/api/client"
import { formatRelativeDate } from "@/lib/format"
import { cn } from "@/lib/utils"

import { useAssistant } from "./assistant-context"
import { ChatView } from "./chat-view"
import { chatQuery, chatsQuery } from "./queries"

/** Opens the assistant, from the top bar. Shown once there's AI. */
export function AssistantButton() {
  const { t } = useTranslation()
  const { setOpen } = useAssistant()
  const aiOn = useCapability("ai")
  if (!aiOn) return null
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setOpen(true)}
      aria-label={t("assistant.open")}
    >
      <HugeiconsIcon
        icon={AiMagicIcon}
        strokeWidth={2}
        data-icon="inline-start"
      />
      <span className="hidden sm:inline">{t("assistant.title")}</span>
    </Button>
  )
}

/**
 * The assistant, in a panel at the side, or a drawer from the bottom on a
 * phone: a chat, or the list of earlier ones to pick up again.
 */
export function AssistantPanel() {
  const { t } = useTranslation()
  const { open, setOpen, chatId, setChatId } = useAssistant()
  const ai = useAiFor("assistant")
  const [listing, setListing] = React.useState(false)
  // A fresh view for each chat picked or started, which keeps going when a
  // new chat gets its id with its first message.
  const [session, setSession] = React.useState({ key: 0, chatId })
  const { data: chats } = useQuery({ ...chatsQuery, enabled: open })
  const title =
    chats?.chats.find((chat) => chat.id === chatId)?.title ??
    t("assistant.title")

  const show = (id: string | null) => {
    setChatId(id)
    setListing(false)
    setSession((now) => ({ key: now.key + 1, chatId: id }))
  }
  const startNew = () => show(null)

  const phone = useIsMobile()
  const Title = phone ? DrawerTitle : SheetTitle
  const Description = phone ? DrawerDescription : SheetDescription
  const Close = phone ? DrawerClose : SheetClose

  const body = (
    <>
      {/* A tablet's side panel stays clear of the status bar. */}
      <div
        className={cn(
          "flex items-center gap-1 border-b px-3 pb-2",
          phone ? "pt-1" : "pt-[calc(env(safe-area-inset-top)+0.5rem)]"
        )}
      >
        {listing ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("assistant.back")}
            onClick={() => setListing(false)}
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("assistant.history")}
            title={t("assistant.history")}
            onClick={() => setListing(true)}
          >
            <HugeiconsIcon icon={TimeQuarterPassIcon} strokeWidth={2} />
          </Button>
        )}
        <Title className="min-w-0 flex-1 truncate text-base">
          {listing ? t("assistant.chats") : title}
        </Title>
        <Description className="sr-only">
          {t("assistant.description")}
        </Description>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("assistant.new")}
          title={t("assistant.new")}
          onClick={startNew}
        >
          <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} />
        </Button>
        <Close
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("assistant.close")}
              title={t("assistant.close")}
            />
          }
        >
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
        </Close>
      </div>

      {ai.why ? (
        <div className="p-4">
          <NeedsAi
            task="assistant"
            why={ai.why}
            onNavigate={() => setOpen(false)}
          />
        </div>
      ) : listing ? (
        <ChatList
          current={chatId}
          onPick={show}
          onDeleted={(id) => {
            if (id === chatId) startNew()
          }}
        />
      ) : session.chatId ? (
        <SavedChat key={session.key} chatId={session.chatId} />
      ) : (
        <ChatView
          key={session.key}
          chatId={null}
          initialMessages={[]}
          onStarted={setChatId}
        />
      )}
    </>
  )

  if (phone) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="h-[88svh]">{body}</DrawerContent>
      </Drawer>
    )
  }
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="gap-0 overflow-hidden p-0 data-[side=right]:rounded-l-3xl data-[side=right]:sm:max-w-md"
      >
        {body}
      </SheetContent>
    </Sheet>
  )
}

/** A chat picked up again, once its messages are in. */
function SavedChat({ chatId }: { chatId: string }) {
  const { setChatId } = useAssistant()
  const { data, isError } = useQuery(chatQuery(chatId))
  // The messages it opened with; later ones come in through the chat.
  const [opened, setOpened] = React.useState(data)
  if (data && !opened) setOpened(data)
  if (isError) return null
  if (!opened) {
    return (
      <div className="grid gap-3 p-4">
        <Skeleton className="h-10 w-2/3 justify-self-end rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
      </div>
    )
  }
  return (
    <ChatView
      chatId={chatId}
      initialMessages={opened.messages as unknown as UIMessage[]}
      onStarted={setChatId}
    />
  )
}

/** Earlier chats, newest first, to open again or delete. */
function ChatList({
  current,
  onPick,
  onDeleted,
}: {
  current: string | null
  onPick: (chatId: string) => void
  onDeleted: (chatId: string) => void
}) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const { data } = useQuery(chatsQuery)

  async function remove(chatId: string) {
    try {
      await unwrap(
        api.DELETE("/api/assistant/chats/{chatId}", {
          params: { path: { chatId } },
        })
      )
      onDeleted(chatId)
      await queryClient.invalidateQueries({ queryKey: ["assistant"] })
      toast.success(t("assistant.deleted"))
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    }
  }

  if (!data) return null
  if (data.chats.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground">{t("assistant.none")}</p>
    )
  }
  return (
    <ul className="grid content-start gap-0.5 overflow-y-auto overscroll-contain p-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
      {data.chats.map((chat) => (
        <li key={chat.id} className="group flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPick(chat.id)}
            className={cn(
              "grid min-w-0 flex-1 gap-0.5 rounded-xl px-3 py-2 text-left hover:bg-muted",
              chat.id === current && "bg-muted"
            )}
          >
            <span className="truncate text-sm font-medium">{chat.title}</span>
            <span className="text-xs text-muted-foreground">
              {formatRelativeDate(chat.updatedAt, i18n.language)}
            </span>
          </button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
            aria-label={t("assistant.delete", { title: chat.title })}
            onClick={() => void remove(chat.id)}
          >
            <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
          </Button>
        </li>
      ))}
    </ul>
  )
}
