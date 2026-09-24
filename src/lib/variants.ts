/**
 * Sizes (product variants). Pure: shared by the storefront, the cart,
 * checkout and the admin panel.
 */

import { z } from 'zod'

export type Variant = {
  id: string
  size: string
  inventory_count: number
  sort_order?: number | null
}

/** Sizes in the order the admin arranged them. */
export function sortVariants<T extends { size: string; sort_order?: number | null }>(variants: readonly T[] | null | undefined): T[] {
  return [...(variants ?? [])].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.size.localeCompare(b.size),
  )
}

/**
 * One cart line per product *and size*: an M and an L of the same shirt are
 * two lines, each with its own quantity.
 */
export function cartLineKey(productId: string, variantId?: string | null): string {
  return variantId ? `${productId}:${variantId}` : productId
}

export const MAX_VARIANTS = 20

/** The sizes editor in the admin panel, submitted as JSON. */
export const variantsSchema = z
  .array(
    z.object({
      size: z.string().trim().min(1, 'Every size needs a name').max(20, 'Size names are at most 20 characters'),
      inventory_count: z.coerce.number().int('Stock must be a whole number').min(0, 'Stock cannot be negative'),
    }),
  )
  .max(MAX_VARIANTS, `At most ${MAX_VARIANTS} sizes`)
  .refine((rows) => new Set(rows.map((r) => r.size.toLowerCase())).size === rows.length, {
    message: 'Each size can appear only once',
  })

export type VariantInput = z.infer<typeof variantsSchema>[number]

/** `null` when the form has no sizes field at all (leave sizes untouched). */
export function parseVariantsField(raw: FormDataEntryValue | null) {
  if (raw === null) return { success: true as const, data: null }
  let json: unknown
  try {
    json = JSON.parse(String(raw))
  } catch {
    return { success: false as const, error: 'Sizes could not be read' }
  }
  const parsed = variantsSchema.safeParse(json)
  return parsed.success
    ? { success: true as const, data: parsed.data }
    : { success: false as const, error: parsed.error.issues[0]?.message ?? 'Invalid sizes' }
}
