import { createClient } from '@/utils/supabase/server'
import { ProductCard } from '@/components/product/ProductCard'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link, redirect } from '@/i18n/navigation'
import { isLocale } from '@/i18n/routing'
import { PRODUCT_TRANSLATIONS, localizeProducts } from '@/lib/localized'
import { buttonVariants } from '@/components/ui/button'
import { Heart } from 'lucide-react'
import { notFound } from 'next/navigation'

export default async function WishlistPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)
  const t = await getTranslations('WishlistPage')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return redirect({ href: '/', locale })
  }

  // Fetch wishlist items
  const { data: wishlistItems } = await supabase
    .from('wishlist')
    .select('product_id')
    .eq('user_id', user.id)

  const productIds = wishlistItems?.map(item => item.product_id) || []

  const { data } = productIds.length > 0
    ? await supabase
        .from('products')
        .select(`*, variants:product_variants(size, inventory_count, sort_order), ${PRODUCT_TRANSLATIONS}`)
        .in('id', productIds)
    : { data: [] }
  const products = localizeProducts(data, locale) as Parameters<typeof ProductCard>[0]['product'][]

  return (
    <div className="container mx-auto px-4 py-12 min-h-[60vh] *:mx-auto *:max-w-7xl">
      <div className="flex items-center space-x-3 mb-8">
        <Heart className="w-8 h-8 text-primary" />
        <h1 className="text-3xl font-bold">{t('title')}</h1>
      </div>

      {products.length === 0 ? (
        <div className="text-center py-16 bg-muted/30 rounded-lg border border-dashed">
          <Heart className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h2 className="text-xl font-semibold mb-2">{t('empty')}</h2>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">{t('emptyHint')}</p>
          {/* A styled link, not a button inside a link: nested interactive elements. */}
          <Link href="/" className={buttonVariants()}>
            {t('startShopping')}
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {products.map(product => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  )
}
