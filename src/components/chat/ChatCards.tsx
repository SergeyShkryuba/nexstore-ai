'use client'

import Image from 'next/image'
import { useLocale, useTranslations } from 'next-intl'
import { ImageOff, Package } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { formatDate, formatPrice } from '@/lib/format'
import { orderStatusKey } from '@/lib/orders'
import type { ChatOrder, ChatProduct } from '@/lib/chat/events'
import type { Locale } from '@/i18n/routing'

/** Products the assistant found, as a scrollable row of small cards linking to their pages. */
export function ProductCards({ products, onNavigate }: { products: ChatProduct[]; onNavigate?: () => void }) {
  const t = useTranslations('Chat')
  const locale = useLocale() as Locale

  return (
    <ul className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
      {products.map((product) => (
        <li key={product.id} className="w-36 shrink-0 snap-start">
          <Link
            href={`/product/${product.slug}`}
            onClick={onNavigate}
            className="block overflow-hidden rounded-xl border bg-card transition-colors hover:border-foreground/30"
          >
            <div className="relative aspect-square bg-muted">
              {product.image_url ? (
                <Image src={product.image_url} alt="" fill sizes="144px" className="object-cover" />
              ) : (
                <ImageOff className="absolute inset-0 m-auto size-6 text-muted-foreground" aria-hidden="true" />
              )}
            </div>
            <div className="space-y-0.5 p-2">
              <p className="line-clamp-2 text-xs font-medium leading-snug">{product.title}</p>
              <p className="text-xs tabular-nums text-muted-foreground">
                {formatPrice(product.price, locale)}
                {product.inventory_count <= 0 && <span className="text-destructive"> · {t('soldOut')}</span>}
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** The shopper's orders, each linking to its page; or a prompt to sign in. */
export function OrderCards({
  signedIn,
  orders,
  onNavigate,
}: {
  signedIn: boolean
  orders: ChatOrder[]
  onNavigate?: () => void
}) {
  const t = useTranslations('Chat.orders')
  const tStatus = useTranslations('OrderStatus')
  const locale = useLocale() as Locale

  if (!signedIn) return <p className="text-xs text-muted-foreground">{t('signIn')}</p>
  if (orders.length === 0) return <p className="text-xs text-muted-foreground">{t('none')}</p>

  return (
    <ul className="space-y-2">
      {orders.map((order) => (
        <li key={order.id}>
          <Link
            href={`/profile/orders/${order.id}`}
            onClick={onNavigate}
            className="flex items-center gap-3 rounded-xl border bg-card p-2.5 text-xs transition-colors hover:border-foreground/30"
          >
            <Package className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{t('order', { id: order.id.slice(0, 8) })}</span>
              <span className="block text-muted-foreground">
                {formatDate(order.created_at, locale)} · {t('items', { count: order.item_count })}
              </span>
            </span>
            <span className="text-right">
              <span className="block font-medium">{tStatus(orderStatusKey(order.status))}</span>
              <span className="block tabular-nums text-muted-foreground">{formatPrice(order.total_amount, locale)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
