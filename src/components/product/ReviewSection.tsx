'use client'

import { useState } from 'react'
import { useRouter } from '@/i18n/navigation'
import { BadgeCheck, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { addReview } from '@/app/actions/reviews'
import { toast } from 'sonner'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { MAX_REVIEW_LENGTH } from '@/lib/review-limits'
import { useLocale, useTranslations } from 'next-intl'
import { formatDate } from '@/lib/format'

interface Review {
  id: string
  rating: number
  comment: string | null
  created_at: string
  /** Set by the database from the author's paid orders. Absent before schema.sql adds it. */
  verified_purchase?: boolean
  profiles: {
    full_name: string | null
    avatar_url: string | null
  } | null
}

export function ReviewSection({ productId, initialReviews }: { productId: string, initialReviews: Review[] }) {
  const t = useTranslations('Reviews')
  const locale = useLocale()
  const [rating, setRating] = useState(5)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    // React nulls out `currentTarget` once the handler yields, so the form has
    // to be captured before the await — the old code threw on reset().
    const form = e.currentTarget
    setIsSubmitting(true)

    const formData = new FormData(form)
    formData.append('product_id', productId)
    formData.append('rating', rating.toString())

    try {
      const result = await addReview(formData)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(t('submitted'))
      form.reset()
      setRating(5)
      // Pull the freshly written review back from the server.
      router.refresh()
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-12 mt-16 border-t pt-12">
      <h2 className="text-2xl font-bold tracking-tight">{t('title')}</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        {/* Reviews List */}
        <div className="space-y-8">
          {initialReviews.length === 0 ? (
            <p className="text-muted-foreground">{t('none')}</p>
          ) : (
            initialReviews.map(review => (
              <div key={review.id} className="flex gap-4 border-b pb-6 last:border-0">
                <Avatar>
                  <AvatarImage src={review.profiles?.avatar_url || ''} alt="" />
                  <AvatarFallback>{review.profiles?.full_name?.charAt(0) ?? '?'}</AvatarFallback>
                </Avatar>
                <div className="space-y-1 flex-1">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm">{review.profiles?.full_name || t('anonymous')}</p>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(review.created_at, locale)}
                    </span>
                  </div>
                  {review.verified_purchase && (
                    <p className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      <BadgeCheck className="size-3.5" aria-hidden="true" />
                      {t('verified')}
                    </p>
                  )}
                  <div className="flex text-yellow-400 my-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className={`w-4 h-4 ${i < review.rating ? 'fill-current' : 'text-muted'}`} />
                    ))}
                  </div>
                  {review.comment && <p className="text-sm text-foreground">{review.comment}</p>}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Add Review Form */}
        <div className="bg-muted/30 p-6 rounded-xl h-fit">
          <h3 className="text-lg font-semibold mb-4">{t('write')}</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-2">{t('rating')}</p>
              <div className="flex gap-1" role="radiogroup" aria-label={t('rating')}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    role="radio"
                    aria-checked={star === rating}
                    aria-label={t('stars', { count: star })}
                    onClick={() => setRating(star)}
                    className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Star
                      aria-hidden="true"
                      className={`w-6 h-6 ${star <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground hover:text-yellow-400'}`}
                    />
                  </button>
                ))}
              </div>
            </div>
            
            <div>
              <p className="text-sm font-medium mb-2">{t('comment')}</p>
              <textarea
                name="comment"
                maxLength={MAX_REVIEW_LENGTH}
                className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder={t('placeholder')}
                aria-label={t('comment')}
              />
            </div>

            <p className="text-xs text-muted-foreground">
              {t('verifiedHint')}
            </p>

            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? t('submitting') : t('submit')}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
