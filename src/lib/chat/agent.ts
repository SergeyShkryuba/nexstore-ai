import type Anthropic from '@anthropic-ai/sdk'
import type { ChatEvent } from './events'
import type { ChatMessage } from './request'
import { CHAT_TOOLS, runTool, type ToolContext } from './tools'

/** Fast and inexpensive; the tools do the knowing, the model the talking. */
export const CHAT_MODEL = 'claude-haiku-4-5'
/** A reply is a few sentences; this leaves room for a tool call or two on top. */
const MAX_TOKENS = 1024
/**
 * Model calls per shopper message. A search, a product lookup and the answer
 * need three; the cap stops a loop from spending without end.
 */
const MAX_MODEL_CALLS = 5

export type ModelParams = Omit<Anthropic.MessageCreateParamsNonStreaming, 'stream'>

/** One streamed model call: text as it is written, then the whole message. */
export type ModelTurn = {
  text: AsyncIterable<string>
  finalMessage(): Promise<Anthropic.Message>
}

export type CallModel = (params: ModelParams) => ModelTurn

/** `CallModel` over the Anthropic SDK. Aborting `signal` (the shopper left) stops the call. */
export function anthropicModel(client: Anthropic, signal?: AbortSignal): CallModel {
  return (params) => {
    const stream = client.messages.stream(params, { signal })
    return {
      text: (async function* () {
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') yield event.delta.text
        }
      })(),
      finalMessage: () => stream.finalMessage(),
    }
  }
}

/** How the reply ended: normally, declined by the model, or at the step cap. */
export type ChatOutcome = 'done' | 'refused' | 'step_limit'

/**
 * Answers the shopper's latest message: streams the model's text, runs the
 * tools it asks for (all of one turn's calls together, their results sent
 * back in one message), and repeats until it answers without a tool.
 */
export async function runChat({
  callModel,
  system,
  history,
  ctx,
  emit,
}: {
  callModel: CallModel
  system: Anthropic.TextBlockParam[]
  history: readonly ChatMessage[]
  ctx: ToolContext
  emit: (event: ChatEvent) => void
}): Promise<ChatOutcome> {
  const messages: Anthropic.MessageParam[] = history.map((m) => ({ role: m.role, content: m.content }))
  let lastText = ''

  for (let call = 0; call < MAX_MODEL_CALLS; call++) {
    const turn = callModel({ model: CHAT_MODEL, max_tokens: MAX_TOKENS, system, tools: CHAT_TOOLS, messages })

    let startOfTurn = true
    for await (const text of turn.text) {
      // "Let me look." [search] "I found…": keep the two apart.
      if (startOfTurn && lastText && !lastText.endsWith('\n')) emit({ type: 'text', text: '\n\n' })
      startOfTurn = false
      lastText = text
      emit({ type: 'text', text })
    }

    const message = await turn.finalMessage()
    if (message.stop_reason === 'refusal') return 'refused'

    const toolUses = message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    // Anything but a completed tool call ends the reply. (At max_tokens a tool
    // call may be cut off; it is not run.)
    if (message.stop_reason !== 'tool_use' || toolUses.length === 0) return 'done'

    messages.push({ role: 'assistant', content: message.content })

    const outcomes = await Promise.all(
      toolUses.map(async (block) => {
        try {
          return await runTool(block.name, block.input, ctx)
        } catch (error) {
          console.error(`Chat: tool ${block.name} failed`, error)
          return { content: JSON.stringify({ error: 'temporarily unavailable' }), isError: true, event: undefined }
        }
      }),
    )
    for (const outcome of outcomes) if (outcome.event) emit(outcome.event)

    messages.push({
      role: 'user',
      content: toolUses.map((block, i) => ({
        type: 'tool_result' as const,
        tool_use_id: block.id,
        content: outcomes[i].content,
        ...(outcomes[i].isError ? { is_error: true } : {}),
      })),
    })
  }

  return 'step_limit'
}
