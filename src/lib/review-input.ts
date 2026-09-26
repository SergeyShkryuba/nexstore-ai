import { z } from 'zod'
import { MAX_REVIEW_LENGTH } from './review-limits'

export { MAX_REVIEW_LENGTH }

const reviewInputSchema = z.object({
  // guid(), not uuid(): the seeded product ids have no RFC version nibble.
  // Messages are error codes; the action shows them in the shopper's language.
  productId: z.guid('product'),
  rating: z.coerce.number().int('rating').min(1, 'rating').max(5, 'rating'),
  comment: z
    .string()
    .trim()
    .max(MAX_REVIEW_LENGTH, 'tooLong')
    // An empty box is "no comment", not an empty string.
    .transform((text) => text || null),
})

export type ReviewInput = z.infer<typeof reviewInputSchema>
export type ReviewInputError = 'product' | 'rating' | 'tooLong'
const ERRORS: readonly string[] = ['product', 'rating', 'tooLong'] satisfies ReviewInputError[]

/** Validates the review form. Anything the browser sent is untrusted. */
export function parseReviewInput(
  formData: FormData,
): { ok: true; review: ReviewInput } | { ok: false; error: ReviewInputError } {
  const parsed = reviewInputSchema.safeParse({
    productId: formData.get('product_id'),
    rating: formData.get('rating'),
    comment: formData.get('comment') ?? '',
  })
  if (!parsed.success) {
    // Zod's own message (e.g. a wrong type) falls back to the closest code.
    const message = parsed.error.issues[0]?.message ?? ''
    const path = parsed.error.issues[0]?.path[0]
    const error = ERRORS.includes(message) ? (message as ReviewInputError) : path === 'productId' ? 'product' : 'rating'
    return { ok: false, error }
  }
  return { ok: true, review: parsed.data }
}
