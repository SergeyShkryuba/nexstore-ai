/**
 * What /api/chat streams to the widget: one JSON object per line (NDJSON).
 * Shared by the server and the browser, so it imports nothing.
 */

export type ChatProduct = {
  id: string
  slug: string
  title: string
  price: number
  image_url: string | null
  /** Units on the shelf across every size; 0 means sold out. */
  inventory_count: number
}

export type ChatOrder = {
  id: string
  created_at: string
  status: string
  total_amount: number
  item_count: number
}

export type ChatEvent =
  /** A piece of the assistant's reply, to append to what is shown. */
  | { type: 'text'; text: string }
  /** Products the assistant found or looked up, shown as cards. */
  | { type: 'products'; products: ChatProduct[] }
  /** The shopper's orders; `signedIn: false` means they have to sign in first. */
  | { type: 'orders'; signedIn: boolean; orders: ChatOrder[] }
  /** Open the "talk to a person" form, prefilled with the assistant's summary. */
  | { type: 'handoff'; summary: string }
  /** The reply stopped early. `busy`: try again shortly; `unavailable`: it will not work now. */
  | { type: 'error'; code: 'busy' | 'unavailable' }
  | { type: 'done' }

export function encodeEvent(event: ChatEvent): string {
  return JSON.stringify(event) + '\n'
}

/**
 * Splits streamed text into complete events. Returns the events and the
 * unfinished tail, which the caller prepends to the next chunk. Lines that are
 * not valid JSON are skipped rather than ending the stream.
 */
export function decodeEvents(buffer: string): { events: ChatEvent[]; rest: string } {
  const lines = buffer.split('\n')
  const rest = lines.pop() ?? ''
  const events: ChatEvent[] = []
  for (const line of lines) {
    if (!line.trim()) continue
    try {
      events.push(JSON.parse(line) as ChatEvent)
    } catch {
      // A malformed line: nothing sensible to show for it.
    }
  }
  return { events, rest }
}
