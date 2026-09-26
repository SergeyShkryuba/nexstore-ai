import { describe, it, expect } from 'vitest'
import { decodeEvents, encodeEvent, type ChatEvent } from './events'

describe('chat event stream', () => {
  it('round-trips events, one per line', () => {
    const events: ChatEvent[] = [
      { type: 'text', text: 'Hola\n¿qué tal?' },
      { type: 'handoff', summary: 'Parcel arrived damaged' },
      { type: 'done' },
    ]
    const { events: decoded, rest } = decodeEvents(events.map(encodeEvent).join(''))
    expect(decoded).toEqual(events)
    expect(rest).toBe('')
  })

  it('keeps an unfinished line for the next chunk', () => {
    const line = encodeEvent({ type: 'text', text: 'streamed' })
    const first = decodeEvents(line.slice(0, 10))
    expect(first.events).toEqual([])

    const second = decodeEvents(first.rest + line.slice(10))
    expect(second.events).toEqual([{ type: 'text', text: 'streamed' }])
  })

  it('skips a malformed line instead of giving up on the stream', () => {
    const { events } = decodeEvents(`not json\n${encodeEvent({ type: 'done' })}`)
    expect(events).toEqual([{ type: 'done' }])
  })
})
