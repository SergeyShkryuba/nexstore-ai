import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { ArrowLeft, Check, ImageOff, MapPin, Phone, XCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/utils/supabase/server'
import { formatPrice } from '@/lib/format'
import { orderProgress, shippingLines } from '@/lib/orders'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Order details',
  robots: { index: false },
}

type OrderItemRow = {
  quantity: number
  unit_price: number
  variant_label: string | null
  product: { title: string; slug: string; image_urls: string[] | null } | null
}

const dateFormatter = new Intl.DateTimeFormat('en-IE', { dateStyle: 'long', timeStyle: 'short' })

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  // RLS returns the row only to its owner (or an admin); anyone else gets a 404.
  const { data: order } = await supabase
    .from('orders')
    .select(
      'id, created_at, status, total_amount, customer_email, shipping_address, order_items(quantity, unit_price, variant_label, product:products(title, slug, image_urls))',
    )
    .eq('id', id)
    .maybeSingle()

  if (!order) notFound()

  const items = (order.order_items ?? []) as unknown as OrderItemRow[]
  const subtotal = items.reduce((sum, item) => sum + Number(item.unit_price) * item.quantity, 0)
  const progress = orderProgress(order.status)
  const shipping = shippingLines(order.shipping_address)

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="mx-auto max-w-4xl space-y-8">
        <Link
          href="/profile"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          All orders
        </Link>

        <div>
          <h1 className="text-3xl font-bold tracking-tight">Order #{order.id.slice(0, 8)}</h1>
          <p className="mt-2 text-muted-foreground">
            Placed {dateFormatter.format(new Date(order.created_at))}
          </p>
        </div>

        {progress.outcome ? (
          <div className="flex items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
            <XCircle className="size-5 text-destructive" aria-hidden="true" />
            <p className="font-medium">
              {progress.outcome === 'refunded'
                ? 'This order was refunded.'
                : 'This order was cancelled.'}
            </p>
          </div>
        ) : (
          <ol className="grid grid-cols-3 gap-2" aria-label="Order progress">
            {progress.steps.map((step) => (
              <li key={step.key} className="space-y-2">
                <div className={cn('h-1.5 rounded-full', step.done ? 'bg-primary' : 'bg-muted')} />
                <p
                  className={cn(
                    'flex items-center gap-1.5 text-sm',
                    step.done ? 'font-medium' : 'text-muted-foreground',
                  )}
                >
                  {step.done && <Check className="size-4" aria-hidden="true" />}
                  {step.label}
                  <span className="sr-only">{step.done ? '(done)' : '(not yet)'}</span>
                </p>
              </li>
            ))}
          </ol>
        )}

        <div className="grid gap-8 md:grid-cols-3">
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Items</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {items.map((item, i) => {
                  const image = item.product?.image_urls?.[0]
                  return (
                    <li key={i} className="flex items-center gap-4 py-4 first:pt-0">
                      <div className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-muted">
                        {image ? (
                          <Image src={image} alt="" fill sizes="64px" className="object-cover" />
                        ) : (
                          <ImageOff className="m-auto mt-5 size-6 text-muted-foreground" aria-hidden="true" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        {item.product ? (
                          <Link href={`/product/${item.product.slug}`} className="font-medium hover:underline">
                            {item.product.title}
                          </Link>
                        ) : (
                          <p className="font-medium text-muted-foreground">No longer in the catalogue</p>
                        )}
                        <p className="text-sm text-muted-foreground">
                          {item.variant_label && <>Size {item.variant_label} · </>}
                          {item.quantity} × {formatPrice(item.unit_price)}
                        </p>
                      </div>
                      <p className="font-medium tabular-nums">
                        {formatPrice(Number(item.unit_price) * item.quantity)}
                      </p>
                    </li>
                  )
                })}
              </ul>

              <dl className="mt-4 space-y-2 border-t pt-4 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd className="tabular-nums">{formatPrice(subtotal)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Shipping</dt>
                  <dd>Free</dd>
                </div>
                <div className="flex justify-between text-base font-semibold">
                  <dt>Total paid</dt>
                  <dd className="tabular-nums">{formatPrice(order.total_amount)}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="size-5" aria-hidden="true" />
                Delivery
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {shipping.name || shipping.lines.length > 0 ? (
                <address className="not-italic leading-relaxed">
                  {shipping.name && <p className="font-medium">{shipping.name}</p>}
                  {shipping.lines.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </address>
              ) : (
                <p className="text-muted-foreground">No delivery address on this order.</p>
              )}
              {shipping.phone && (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="size-4" aria-hidden="true" />
                  {shipping.phone}
                </p>
              )}
              {order.customer_email && (
                <p className="text-muted-foreground">Receipt sent to {order.customer_email}</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
