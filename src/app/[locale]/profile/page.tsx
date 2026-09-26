import { createClient } from '@/utils/supabase/server'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Link, redirect } from '@/i18n/navigation'
import { isLocale } from '@/i18n/routing'
import { ChevronRight, Package, User } from 'lucide-react'
import { formatDate, formatPrice } from '@/lib/format'
import { orderStatusKey } from '@/lib/orders'

type OrderRow = {
  id: string
  created_at: string
  total_amount: number | string
  status: string
}

export default async function ProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)
  const [t, tStatus] = await Promise.all([getTranslations('Profile'), getTranslations('OrderStatus')])
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return redirect({ href: '/', locale })
  }

  // Fetch profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // Fetch orders (if any)
  const { data: orders } = await supabase
    .from('orders')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  return (
    <div className="container mx-auto px-4 py-12 min-h-[60vh]">
      <h1 className="text-3xl font-bold mb-8">{t('title')}</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <User className="w-5 h-5" />
                <span>{t('details')}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">{t('fullName')}</p>
                <p className="font-medium">{profile?.full_name || t('notProvided')}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('email')}</p>
                <p className="font-medium">{user.email}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('role')}</p>
                <p className="font-medium">{profile?.role === 'admin' ? t('roleAdmin') : t('roleUser')}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="md:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Package className="w-5 h-5" />
                <span>{t('orders')}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!orders || orders.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Package className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p>{t('noOrders')}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {(orders as OrderRow[]).map((order) => (
                    <Link
                      key={order.id}
                      href={`/profile/orders/${order.id}`}
                      className="border p-4 rounded-lg flex justify-between items-center transition-colors hover:bg-muted/50"
                    >
                      <div>
                        <p className="font-semibold">{t('orderNumber', { id: order.id.slice(0, 8) })}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatDate(order.created_at, locale)}
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="font-bold">{formatPrice(order.total_amount, locale)}</p>
                          <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full uppercase tracking-wider">
                            {tStatus(orderStatusKey(order.status))}
                          </span>
                        </div>
                        <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
