'use client'

import { useState } from 'react'
import { Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { addReview } from '@/app/actions/reviews'
import { toast } from 'sonner'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

interface Review {
  id: string
  rating: number
  comment: string | null
  created_at: string
  profiles: {
    full_name: string | null
    avatar_url: string | null
  }
}

export function ReviewSection({ productId, initialReviews }: { productId: string, initialReviews: Review[] }) {
  const [rating, setRating] = useState(5)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)
    const formData = new FormData(e.currentTarget)
    formData.append('product_id', productId)
    formData.append('rating', rating.toString())

    const result = await addReview(formData)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Review submitted!')
      e.currentTarget.reset()
      setRating(5)
    }
    setIsSubmitting(false)
  }

  return (
    <div className="space-y-12 mt-16 border-t pt-12">
      <h2 className="text-2xl font-bold tracking-tight">Customer Reviews</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        {/* Reviews List */}
        <div className="space-y-8">
          {initialReviews.length === 0 ? (
            <p className="text-muted-foreground">No reviews yet. Be the first to review this product!</p>
          ) : (
            initialReviews.map(review => (
              <div key={review.id} className="flex gap-4 border-b pb-6 last:border-0">
                <Avatar>
                  <AvatarImage src={review.profiles.avatar_url || ''} />
                  <AvatarFallback>{review.profiles.full_name?.charAt(0) || 'U'}</AvatarFallback>
                </Avatar>
                <div className="space-y-1 flex-1">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm">{review.profiles.full_name || 'Anonymous User'}</p>
                    <span className="text-xs text-muted-foreground">
                      {new Date(review.created_at).toLocaleDateString()}
                    </span>
                  </div>
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
          <h3 className="text-lg font-semibold mb-4">Write a Review</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-2">Rating</p>
              <div className="flex gap-1 cursor-pointer">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star 
                    key={star} 
                    className={`w-6 h-6 ${star <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground hover:text-yellow-400'}`}
                    onClick={() => setRating(star)}
                  />
                ))}
              </div>
            </div>
            
            <div>
              <p className="text-sm font-medium mb-2">Comment (Optional)</p>
              <textarea 
                name="comment"
                className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="What did you like or dislike?"
              />
            </div>

            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? 'Submitting...' : 'Submit Review'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
