import type Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { searchCatalogue, type SearchHit } from '@/lib/search-service'
import { PRODUCT_TRANSLATIONS, localizeProduct } from '@/lib/localized'
import { sortVariants } from '@/lib/variants'
import type { Locale } from '@/i18n/routing'
import type { ChatEvent, ChatOrder, ChatProduct } from './events'

/**
 * The shop assistant's tools. Each one validates what the model sent, reads
 * with the caller's own rights, and returns two things: a compact JSON answer
 * for the model, and an event for the widget (product or order cards, the
 * contact form), so the shopper sees real data rather than the model's
 * retelling of it.
 */

export type ToolContext = {
  /** Anonymous client: the catalogue is public. */
  catalogue: Pick<SupabaseClient, 'from' | 'rpc'>
  /** The shopper's session client: RLS limits it to what they may see. */
  account: Pick<SupabaseClient, 'from'>
  userId: string | null
  locale: Locale
}

export type ToolOutcome = {
  /** For the model: JSON text. */
  content: string
  isError?: boolean
  event?: ChatEvent
}

/** Products the assistant hears about per search; the cards show the same ones. */
const MAX_RESULTS = 5
/** Orders it reads when looking one up by number. */
const ORDER_SCAN = 20
const MAX_ORDERS = 5

export const CHAT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'search_products',
    description:
      'Search the store catalogue. Returns up to 5 products with price, stock and sizes in stock, best match first, and shows them to the shopper as cards. Write the query in English, even when the shopper writes in another language.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'What the shopper is looking for, in English, e.g. "noise cancelling headphones".',
        },
        max_price: { type: 'number', description: 'Budget in euros, if the shopper gave one.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_product',
    description:
      'Details of one product by its slug (from search_products): description, specifications, price, and stock per size. Shows it to the shopper as a card.',
    input_schema: {
      type: 'object',
      properties: { slug: { type: 'string', description: 'The product slug, e.g. "wireless-headphones".' } },
      required: ['slug'],
    },
  },
  {
    name: 'get_my_orders',
    description:
      "The signed-in shopper's recent orders with status (pending, paid, shipped, delivered, cancelled, refunded), date, total and items; shown to them as cards. Pass order_ref to find one order by the number shown on its page (the first characters of its id). Returns signed_in: false for visitors who are not signed in.",
    input_schema: {
      type: 'object',
      properties: {
        order_ref: { type: 'string', description: 'Order number or its first characters, e.g. "3f9a1c2b".' },
      },
    },
  },
  {
    name: 'request_human',
    description:
      'Show the shopper a form to contact the store team, who answer by email. Use when they ask for a person or need something you cannot do.',
    input_schema: {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          description: "One or two sentences for the team, in English: what the shopper needs and any order number.",
        },
      },
      required: ['summary'],
    },
  },
]

const searchInput = z.object({
  query: z.string().trim().min(2).max(200),
  max_price: z.number().positive().max(100_000).optional(),
})
const productInput = z.object({ slug: z.string().trim().min(1).max(200) })
const ordersInput = z.object({ order_ref: z.string().trim().max(64).optional() })
const handoffInput = z.object({ summary: z.string().trim().min(1).max(500) })

type Variant = { size: string; inventory_count: number; sort_order: number | null }

function sizesInStock(variants: readonly Variant[] | null | undefined): string[] {
  return sortVariants(variants ?? [])
    .filter((v) => v.inventory_count > 0)
    .map((v) => v.size)
}

function card(product: Pick<SearchHit, 'id' | 'slug' | 'title' | 'price' | 'image_urls' | 'inventory_count'>): ChatProduct {
  return {
    id: product.id,
    slug: product.slug,
    title: product.title,
    price: Number(product.price),
    image_url: product.image_urls?.[0] ?? null,
    inventory_count: product.inventory_count ?? 0,
  }
}

function clip(text: string | null | undefined, chars: number): string | null {
  if (!text) return null
  return text.length > chars ? `${text.slice(0, chars - 1)}…` : text
}

const json = (value: unknown) => JSON.stringify(value)
const invalid = (issue: string): ToolOutcome => ({ content: json({ error: `invalid input: ${issue}` }), isError: true })

async function searchProducts(input: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  const parsed = searchInput.safeParse(input)
  if (!parsed.success) return invalid('query must be 2-200 characters')
  const { query, max_price } = parsed.data

  // Ranked in English, where the semantic half works; shown in the shopper's language.
  const search = await searchCatalogue(ctx.catalogue, query, 'en', ctx.locale)
  const hits = search.results
    .map((r) => r.product)
    .filter((p) => max_price === undefined || Number(p.price) <= max_price)
    .slice(0, MAX_RESULTS)

  return {
    content: json({
      results: hits.map((p) => ({
        slug: p.slug,
        title: p.title,
        price_eur: Number(p.price),
        in_stock: p.inventory_count > 0,
        sizes_in_stock: p.variants?.length ? sizesInStock(p.variants) : undefined,
        description: clip(p.description, 160),
      })),
    }),
    event: hits.length > 0 ? { type: 'products', products: hits.map(card) } : undefined,
  }
}

async function getProduct(input: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  const parsed = productInput.safeParse(input)
  if (!parsed.success) return invalid('slug is required')

  const { data, error } = await ctx.catalogue
    .from('products')
    .select(
      `id, slug, title, description, price, image_urls, attributes, inventory_count, variants:product_variants(size, inventory_count, sort_order), ${PRODUCT_TRANSLATIONS}`,
    )
    .eq('slug', parsed.data.slug)
    .maybeSingle()
  if (error) throw error
  if (!data) return { content: json({ error: 'no product with this slug; search first' }), isError: true }

  const product = localizeProduct(data, ctx.locale) as SearchHit & { variants: Variant[] | null }
  return {
    content: json({
      slug: product.slug,
      title: product.title,
      price_eur: Number(product.price),
      in_stock: product.inventory_count > 0,
      sizes: product.variants?.length
        ? sortVariants(product.variants).map((v) => ({ size: v.size, in_stock: v.inventory_count > 0 }))
        : undefined,
      specifications: product.attributes ?? undefined,
      description: clip(product.description, 1200),
    }),
    event: { type: 'products', products: [card(product)] },
  }
}

type OrderRow = {
  id: string
  created_at: string
  status: string
  total_amount: number | string
  order_items: Array<{
    quantity: number
    variant_label: string | null
    product: ({ title: string; translations?: never[] | null }) | null
  }> | null
}

async function getMyOrders(input: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  const parsed = ordersInput.safeParse(input)
  if (!parsed.success) return invalid('order_ref is too long')

  if (!ctx.userId) {
    return { content: json({ signed_in: false }), event: { type: 'orders', signedIn: false, orders: [] } }
  }

  // RLS already hides other people's orders, but lets an admin read all of
  // them: the explicit filter keeps the assistant to the shopper's own.
  const { data, error } = await ctx.account
    .from('orders')
    .select(`id, created_at, status, total_amount, order_items(quantity, variant_label, product:products(title, ${PRODUCT_TRANSLATIONS}))`)
    .eq('user_id', ctx.userId)
    .order('created_at', { ascending: false })
    .limit(ORDER_SCAN)
  if (error) throw error

  const ref = parsed.data.order_ref?.replace(/^#/, '').toLowerCase()
  const rows = ((data ?? []) as unknown as OrderRow[]).filter((o) => !ref || o.id.toLowerCase().startsWith(ref))
  const orders = rows.slice(0, MAX_ORDERS)

  const cards: ChatOrder[] = orders.map((o) => ({
    id: o.id,
    created_at: o.created_at,
    status: o.status,
    total_amount: Number(o.total_amount),
    item_count: (o.order_items ?? []).reduce((n, item) => n + item.quantity, 0),
  }))

  return {
    content: json({
      signed_in: true,
      orders: orders.map((o) => ({
        number: o.id.slice(0, 8),
        placed: o.created_at.slice(0, 10),
        status: o.status,
        total_eur: Number(o.total_amount),
        items: (o.order_items ?? []).map((item) => ({
          title: item.product ? localizeProduct(item.product, ctx.locale).title : '(removed product)',
          quantity: item.quantity,
          size: item.variant_label ?? undefined,
        })),
      })),
      more_orders: rows.length > orders.length,
    }),
    event: { type: 'orders', signedIn: true, orders: cards },
  }
}

function requestHuman(input: unknown): ToolOutcome {
  const parsed = handoffInput.safeParse(input)
  if (!parsed.success) return invalid('summary is required, at most 500 characters')
  return {
    content: json({
      form_shown: true,
      note: 'The shopper now sees a contact form. Tell them in one sentence to leave their email and message there; the team replies by email.',
    }),
    event: { type: 'handoff', summary: parsed.data.summary },
  }
}

/** Runs one tool call. Unknown tools and bad input come back as errors the model can read. */
export async function runTool(name: string, input: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  switch (name) {
    case 'search_products':
      return searchProducts(input, ctx)
    case 'get_product':
      return getProduct(input, ctx)
    case 'get_my_orders':
      return getMyOrders(input, ctx)
    case 'request_human':
      return requestHuman(input)
    default:
      return { content: json({ error: `unknown tool ${name}` }), isError: true }
  }
}
