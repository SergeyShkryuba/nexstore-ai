import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { OrderStatusSelect } from '@/components/admin/OrderStatusSelect'
import { formatPrice } from '@/lib/format'
import type { OrderStatus } from '@/lib/admin-schemas'

type OrderItemRow = {
  quantity: number
  unit_price: number
  product: { title: string; slug: string } | null
}

const dateFormatter = new Intl.DateTimeFormat('en-IE', { dateStyle: 'medium', timeStyle: 'short' })

export default async function AdminOrdersPage() {
  const supabase = await createClient()

  // Admins see every order through the RLS policy on `orders` and `order_items`.
  const { data: orders, error } = await supabase
    .from('orders')
    .select(
      'id, created_at, status, total_amount, customer_email, order_items(quantity, unit_price, product:products(title, slug))',
    )
    .order('created_at', { ascending: false })
    .limit(200)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Orders</h1>
        <p className="text-muted-foreground mt-2">
          Newest first. Changing a status saves immediately and shows on the customer&apos;s account page.
        </p>
      </div>

      {error && <p className="text-destructive">Could not load orders: {error.message}</p>}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs uppercase bg-muted/50 border-b">
                <tr>
                  <th className="px-6 py-4 font-medium">Order</th>
                  <th className="px-6 py-4 font-medium">Customer</th>
                  <th className="px-6 py-4 font-medium">Items</th>
                  <th className="px-6 py-4 font-medium text-right">Total</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {orders?.map((order) => {
                  const items = (order.order_items ?? []) as unknown as OrderItemRow[]
                  return (
                    <tr key={order.id} className="align-top hover:bg-muted/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-mono text-xs">#{order.id.slice(0, 8)}</div>
                        <div className="text-muted-foreground text-xs mt-1">
                          {dateFormatter.format(new Date(order.created_at))}
                        </div>
                      </td>
                      <td className="px-6 py-4">{order.customer_email ?? <span className="text-muted-foreground">Guest</span>}</td>
                      <td className="px-6 py-4">
                        <ul className="space-y-1">
                          {items.map((item, i) => (
                            <li key={i} className="whitespace-nowrap">
                              {item.quantity} ×{' '}
                              {item.product ? (
                                <Link href={`/product/${item.product.slug}`} className="hover:underline">
                                  {item.product.title}
                                </Link>
                              ) : (
                                <span className="text-muted-foreground">Deleted product</span>
                              )}
                              <span className="text-muted-foreground"> · {formatPrice(item.unit_price)}</span>
                            </li>
                          ))}
                        </ul>
                      </td>
                      <td className="px-6 py-4 text-right font-medium tabular-nums whitespace-nowrap">
                        {formatPrice(order.total_amount)}
                      </td>
                      <td className="px-6 py-4">
                        <OrderStatusSelect orderId={order.id} status={order.status as OrderStatus} />
                      </td>
                    </tr>
                  )
                })}
                {!error && !orders?.length && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                      No orders yet. They appear here once Stripe confirms a payment.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
