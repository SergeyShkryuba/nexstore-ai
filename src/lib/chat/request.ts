import { z } from 'zod'
import { LOCALES } from '@/i18n/routing'

/**
 * Limits on what the widget may send. The whole conversation comes with every
 * message (the server keeps no chat state), so these also bound the cost of a
 * single request.
 */
export const CHAT_LIMITS = {
  /** Characters in one message. */
  messageChars: 1000,
  /** Messages the widget may send. */
  messages: 40,
  /** Messages the model sees: the most recent ones. */
  context: 12,
} as const

const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  // Assistant replies can run longer than what a shopper types.
  content: z.string().trim().min(1).max(CHAT_LIMITS.messageChars * 4),
})

export const chatRequestSchema = z.object({
  locale: z.enum(LOCALES).default('en'),
  messages: z
    .array(chatMessageSchema)
    .min(1)
    .max(CHAT_LIMITS.messages)
    .refine((messages) => messages.at(-1)?.role === 'user', 'lastNotUser')
    .refine(
      (messages) => messages.every((m) => m.role !== 'user' || m.content.length <= CHAT_LIMITS.messageChars),
      'tooLong',
    ),
})

export type ChatMessage = z.infer<typeof chatMessageSchema>
export type ChatRequest = z.infer<typeof chatRequestSchema>

/**
 * The part of the conversation the model sees: the latest messages, starting
 * with a shopper's message (the API requires it), with consecutive messages of
 * one role merged so a retried send does not read as two turns.
 */
export function modelHistory(messages: readonly ChatMessage[], limit: number = CHAT_LIMITS.context): ChatMessage[] {
  let recent = messages.slice(-limit)
  const firstUser = recent.findIndex((m) => m.role === 'user')
  recent = firstUser === -1 ? [] : recent.slice(firstUser)

  const merged: ChatMessage[] = []
  for (const message of recent) {
    const last = merged.at(-1)
    if (last && last.role === message.role) {
      merged[merged.length - 1] = { role: last.role, content: `${last.content}\n\n${message.content}` }
    } else {
      merged.push({ ...message })
    }
  }
  return merged
}
