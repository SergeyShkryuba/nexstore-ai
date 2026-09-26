/**
 * Validation for the admin panel's writes. Pure (zod only), so the rules that
 * guard the catalogue are unit-tested without a database or a session.
 */

import { z } from 'zod'

/** Must match the `orders.status` check constraint in supabase/schema.sql. */
export const ORDER_STATUSES = ['pending', 'paid', 'shipped', 'delivered', 'cancelled', 'refunded'] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

export const orderStatusSchema = z.enum(ORDER_STATUSES)

export const MAX_PRODUCT_IMAGES = 8

/** Supabase Storage bucket for uploaded product photos (public read). */
export const PRODUCT_IMAGES_BUCKET = 'product-images'

/**
 * Image hosts next/image is allowed to load (see `images.remotePatterns` in
 * next.config.ts). A URL anywhere else would save fine and then break every
 * page that renders the product, so it is rejected at the door instead.
 */
export function isAllowedImageUrl(raw: string, supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL): boolean {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  if (url.hostname === 'images.unsplash.com' || url.hostname === 'placehold.co') return true

  // Our own Storage bucket: <project>.supabase.co/storage/v1/object/public/product-images/...
  if (!supabaseUrl) return false
  try {
    const own = new URL(supabaseUrl)
    return (
      url.hostname === own.hostname &&
      url.pathname.startsWith(`/storage/v1/object/public/${PRODUCT_IMAGES_BUCKET}/`)
    )
  } catch {
    return false
  }
}

export const productSchema = z.object({
  title: z.string().trim().min(2, 'Title is required').max(120),
  description: z.string().trim().max(2000).optional().default(''),
  // `price` was once validated with `!price`, which rejected a legitimate free
  // product and accepted NaN from a non-numeric field.
  price: z.coerce.number().nonnegative('Price must be zero or more'),
  inventory_count: z.coerce.number().int('Stock must be a whole number').min(0).default(0),
  // guid(), not uuid(): Zod 4's uuid() insists on an RFC version nibble, which
  // the seeded ids ('11111111-1111-…') lack — every seeded category was
  // rejected as "Pick a category". Postgres still checks the value is a uuid.
  category_id: z.guid('Pick a category'),
  image_urls: z
    .array(z.string().trim())
    .max(MAX_PRODUCT_IMAGES, `At most ${MAX_PRODUCT_IMAGES} images`)
    .default([])
    .transform((urls) => [...new Set(urls.filter(Boolean))])
    .refine((urls) => urls.every((u) => isAllowedImageUrl(u)), {
      message: 'Images must be uploaded here or come from images.unsplash.com',
    }),
})

export type ProductInput = z.infer<typeof productSchema>

/** Reads a product form: `image_urls` is a repeated field, in display order. */
export function parseProductForm(formData: FormData) {
  return productSchema.safeParse({
    title: formData.get('title'),
    description: formData.get('description') ?? '',
    price: formData.get('price'),
    inventory_count: formData.get('inventory_count') ?? 0,
    category_id: formData.get('category_id'),
    image_urls: formData.getAll('image_urls').map(String),
  })
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
}

export const categorySchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(60),
  description: z.string().trim().max(300).optional().default(''),
  image_url: z
    .string()
    .trim()
    .optional()
    .default('')
    .refine((url) => url === '' || isAllowedImageUrl(url), {
      message: 'The image must be uploaded here or come from images.unsplash.com',
    }),
})

export function parseCategoryForm(formData: FormData) {
  return categorySchema.safeParse({
    name: formData.get('name'),
    description: formData.get('description') ?? '',
    image_url: formData.get('image_url') ?? '',
  })
}

/** The languages the catalogue is translated into; English is the row itself. */
export const TRANSLATED_LOCALES = ['es', 'ru'] as const
export type TranslatedLocale = (typeof TRANSLATED_LOCALES)[number]

/**
 * A translation as the admin form sends it: `es.title`, `es.description`, …
 * An empty title means "no translation" (the page falls back to English).
 */
export type TranslationsInput = Record<TranslatedLocale, { title: string; description: string }>

function translationSchema(limits: { title: number; description: number }) {
  const one = z.object({
    title: z.string().trim().max(limits.title, `Translated names are at most ${limits.title} characters`).default(''),
    description: z
      .string()
      .trim()
      .max(limits.description, `Translated descriptions are at most ${limits.description} characters`)
      .default(''),
  })
  return z.object({ es: one, ru: one })
}

/** Same limits as the English fields, so a translation fits wherever the original does. */
export const PRODUCT_TRANSLATION_LIMITS = { title: 120, description: 2000 }
export const CATEGORY_TRANSLATION_LIMITS = { title: 60, description: 300 }

export function parseTranslationsForm(formData: FormData, limits: { title: number; description: number }) {
  const field = (name: string) => {
    const value = formData.get(name)
    return typeof value === 'string' ? value : ''
  }
  return translationSchema(limits).safeParse(
    Object.fromEntries(
      TRANSLATED_LOCALES.map((l) => [l, { title: field(`${l}.title`), description: field(`${l}.description`) }]),
    ),
  )
}
