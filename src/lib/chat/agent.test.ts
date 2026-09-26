import { describe, it, expect, vi, beforeEach } from 'vitest'
import type Anthropic from '@anthropic-ai/sdk'

const runTool = vi.fn()
vi.mock('./tools', () => ({ CHAT_TOOLS: [], runTool: (...args: unknown[]) => runTool(...args) }))

import { runChat, type CallModel, type ModelParams } from './agent'
import type { ChatEvent } from './events'
import type { ToolContext } from './tools'

type Block = { type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: unknown }

/** A scripted model: each call streams its text blocks and ends with the given stop reason. */
function scriptedModel(turns: Array<{ blocks: Block[]; stop: Anthropic.StopReason }>) {
  const calls: ModelParams[] = []
  const callModel: CallModel = (params) => {
    // What the model saw at this point, not the array runChat keeps appending to.
    calls.push(structuredClone(params))
    const turn = turns[calls.length - 1]
    return {
      text: (async function* () {
        for (const block of turn.blocks) if (block.type === 'text') yield block.text
      })(),
      finalMessage: async () => ({ content: turn.blocks, stop_reason: turn.stop }) as unknown as Anthropic.Message,
    }
  }
  return { callModel, calls }
}

const ctx = {} as ToolContext

async function run(callModel: CallModel) {
  const events: ChatEvent[] = []
  const outcome = await runChat({
    callModel,
    system: [],
    history: [{ role: 'user', content: 'headphones under 100?' }],
    ctx,
    emit: (e) => events.push(e),
  })
  return { outcome, events }
}

beforeEach(() => {
  runTool.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('runChat', () => {
  it('streams a plain answer and stops', async () => {
    const { callModel, calls } = scriptedModel([{ blocks: [{ type: 'text', text: 'Hi!' }], stop: 'end_turn' }])
    const { outcome, events } = await run(callModel)
    expect(outcome).toBe('done')
    expect(events).toEqual([{ type: 'text', text: 'Hi!' }])
    expect(calls).toHaveLength(1)
    expect(calls[0].model).toBe('claude-haiku-4-5')
  })

  it('runs every tool of a turn, sends all results back in one message, then streams the answer', async () => {
    runTool.mockImplementation(async (name: string) =>
      name === 'search_products'
        ? { content: '{"results":[]}', event: { type: 'products', products: [] } }
        : { content: '{"error":"no product"}', isError: true },
    )
    const { callModel, calls } = scriptedModel([
      {
        blocks: [
          { type: 'text', text: 'Let me look.' },
          { type: 'tool_use', id: 't1', name: 'search_products', input: { query: 'headphones' } },
          { type: 'tool_use', id: 't2', name: 'get_product', input: { slug: 'x' } },
        ],
        stop: 'tool_use',
      },
      { blocks: [{ type: 'text', text: 'Nothing under 100.' }], stop: 'end_turn' },
    ])

    const { outcome, events } = await run(callModel)

    expect(outcome).toBe('done')
    expect(runTool).toHaveBeenCalledTimes(2)
    expect(events).toEqual([
      { type: 'text', text: 'Let me look.' },
      { type: 'products', products: [] },
      { type: 'text', text: '\n\n' },
      { type: 'text', text: 'Nothing under 100.' },
    ])

    const second = calls[1].messages
    expect(second.map((m) => m.role)).toEqual(['user', 'assistant', 'user'])
    expect(second[2].content).toEqual([
      { type: 'tool_result', tool_use_id: 't1', content: '{"results":[]}' },
      { type: 'tool_result', tool_use_id: 't2', content: '{"error":"no product"}', is_error: true },
    ])
  })

  it('turns a failing tool into an error result instead of ending the reply', async () => {
    runTool.mockRejectedValue(new Error('database down'))
    const { callModel, calls } = scriptedModel([
      { blocks: [{ type: 'tool_use', id: 't1', name: 'get_my_orders', input: {} }], stop: 'tool_use' },
      { blocks: [{ type: 'text', text: 'Sorry, I cannot see orders right now.' }], stop: 'end_turn' },
    ])
    const { outcome } = await run(callModel)
    expect(outcome).toBe('done')
    expect(calls[1].messages[2].content).toEqual([
      { type: 'tool_result', tool_use_id: 't1', content: '{"error":"temporarily unavailable"}', is_error: true },
    ])
  })

  it('does not run a tool call cut off at max_tokens', async () => {
    const { callModel } = scriptedModel([
      { blocks: [{ type: 'tool_use', id: 't1', name: 'search_products', input: { query: 'he' } }], stop: 'max_tokens' },
    ])
    expect((await run(callModel)).outcome).toBe('done')
    expect(runTool).not.toHaveBeenCalled()
  })

  it('reports a refusal', async () => {
    const { callModel } = scriptedModel([{ blocks: [], stop: 'refusal' }])
    expect((await run(callModel)).outcome).toBe('refused')
  })

  it('stops a model that keeps calling tools', async () => {
    runTool.mockResolvedValue({ content: '{}' })
    const loop = { blocks: [{ type: 'tool_use', id: 't', name: 'search_products', input: { query: 'more' } }] as Block[], stop: 'tool_use' as const }
    const { callModel, calls } = scriptedModel(Array.from({ length: 10 }, () => loop))
    expect((await run(callModel)).outcome).toBe('step_limit')
    expect(calls).toHaveLength(5)
  })
})
