import { z } from 'zod'
import { MAX_REVIEW_LENGTH } from './review-limits'

export { MAX_REVIEW_LENGTH }

const reviewInputSchema = z.object({
  // guid(), not uuid(): the seeded product ids have no RFC version nibble.
  productId: z.guid('Invalid product.'),
  rating: z.coerce.number().int().min(1, 'Choose a rating from 1 to 5.').max(5, 'Choose a rating from 1 to 5.'),
  comment: z
    .string()
    .trim()
    .max(MAX_REVIEW_LENGTH, `Keep the review under ${MAX_REVIEW_LENGTH} characters.`)
    // An empty box is "no comment", not an empty string.
    .transform((text) => text || null),
})

export type ReviewInput = z.infer<typeof reviewInputSchema>

/** Validates the review form. Anything the browser sent is untrusted. */
export function parseReviewInput(
  formData: FormData,
): { ok: true; review: ReviewInput } | { ok: false; error: string } {
  const parsed = reviewInputSchema.safeParse({
    productId: formData.get('product_id'),
    rating: formData.get('rating'),
    comment: formData.get('comment') ?? '',
  })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid review.' }
  return { ok: true, review: parsed.data }
}
