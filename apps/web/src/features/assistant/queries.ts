import { queryOptions } from "@tanstack/react-query"

import { api, unwrap, type Schemas } from "@/lib/api/client"

export type ChatSummary = Schemas["Chat"]

/** Your chats, newest first. */
export const chatsQuery = queryOptions({
  queryKey: ["assistant", "chats"],
  queryFn: () => unwrap(api.GET("/api/assistant/chats")),
})

/** A chat with its messages. */
export const chatQuery = (chatId: string) =>
  queryOptions({
    queryKey: ["assistant", "chat", chatId],
    queryFn: () =>
      unwrap(
        api.GET("/api/assistant/chats/{chatId}", {
          params: { path: { chatId } },
        })
      ),
    staleTime: Infinity,
  })

/** A suggestion, as it stands now: waiting, applied or dismissed. */
export const proposalQuery = (proposalId: string) =>
  queryOptions({
    queryKey: ["review", "proposal", proposalId],
    queryFn: () =>
      unwrap(
        api.GET("/api/proposals/{proposalId}", {
          params: { path: { proposalId } },
        })
      ),
  })
