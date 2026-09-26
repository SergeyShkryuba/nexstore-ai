'use client'

import { useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { CheckCircle2 } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { buttonVariants } from '@/components/ui/button'
import { useCartStore } from '@/store/useCartStore'

function SuccessContent() {
  const t = useTranslations('CheckoutSuccess')
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session_id')
  const clearCart = useCartStore((state) => state.clearCart)

  // The only job of this effect is the side effect; no `mounted` flag needed,
  // because nothing below depends on persisted cart contents.
  useEffect(() => {
    if (sessionId) clearCart()
  }, [sessionId, clearCart])

  return (
    <div className="container mx-auto px-4 py-16 flex flex-col items-center justify-center text-center animate-in zoom-in duration-500">
      <CheckCircle2 className="h-24 w-24 text-green-500 mb-6" aria-hidden="true" />
      <h1 className="text-4xl font-bold mb-4">{t('title')}</h1>
      <p className="text-xl text-muted-foreground mb-2">{t('thanks')}</p>
      {sessionId && (
        <p className="text-sm text-muted-foreground mb-8">
          {t('session', { id: `${sessionId.slice(0, 10)}…` })}
        </p>
      )}
      <div className="flex gap-4">
        <Link href="/profile" className={buttonVariants({ variant: "outline", size: "lg" })}>
          {t('orders')}
        </Link>
        <Link href="/" className={buttonVariants({ size: "lg" })}>
          {t('continue')}
        </Link>
      </div>
    </div>
  )
}

function Fallback() {
  const t = useTranslations('CheckoutSuccess')
  return <div className="container mx-auto px-4 py-16 text-center">{t('loading')}</div>
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={<Fallback />}>
      <SuccessContent />
    </Suspense>
  )
}
