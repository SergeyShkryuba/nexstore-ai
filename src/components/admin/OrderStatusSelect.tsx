'use client'

import { useState, useTransition } from 'react'
import { useRouter } from '@/i18n/navigation'
import { toast } from 'sonner'
import { updateOrderStatus } from '@/app/actions/admin'
import { ORDER_STATUSES, type OrderStatus } from '@/lib/admin-schemas'
import { cn } from '@/lib/utils'

const TONE: Record<OrderStatus, string> = {
  pending: 'text-muted-foreground',
  paid: 'text-blue-600 dark:text-blue-400',
  shipped: 'text-amber-600 dark:text-amber-400',
  delivered: 'text-green-600 dark:text-green-400',
  cancelled: 'text-destructive',
  refunded: 'text-destructive',
}

/** Saves on change; the select rolls back if the server refuses. */
export function OrderStatusSelect({ orderId, status }: { orderId: string; status: OrderStatus }) {
  const router = useRouter()
  const [value, setValue] = useState(status)
  const [isPending, startTransition] = useTransition()

  const change = (next: OrderStatus) => {
    const previous = value
    setValue(next)
    startTransition(async () => {
      const result = await updateOrderStatus(orderId, next)
      if ('error' in result) {
        setValue(previous)
        toast.error(result.error)
        return
      }
      toast.success(`Order marked ${next}`)
      router.refresh()
    })
  }

  return (
    <select
      value={value}
      disabled={isPending}
      onChange={(e) => change(e.target.value as OrderStatus)}
      aria-label="Order status"
      className={cn(
        'h-8 rounded-lg border border-input bg-transparent px-2 text-sm font-medium capitalize outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 dark:bg-input/30',
        TONE[value],
      )}
    >
      {ORDER_STATUSES.map((s) => (
        <option key={s} value={s} className="text-foreground">
          {s}
        </option>
      ))}
    </select>
  )
}
