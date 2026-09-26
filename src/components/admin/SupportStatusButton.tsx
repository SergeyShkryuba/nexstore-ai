'use client'

import { useTransition } from 'react'
import { useRouter } from '@/i18n/navigation'
import { toast } from 'sonner'
import { updateSupportStatus } from '@/app/actions/admin'
import { Button } from '@/components/ui/button'

/** Marks a request resolved, or reopens it. */
export function SupportStatusButton({ requestId, status }: { requestId: string; status: 'open' | 'resolved' }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const next = status === 'open' ? 'resolved' : 'open'

  return (
    <Button
      variant={status === 'open' ? 'default' : 'outline'}
      size="sm"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await updateSupportStatus(requestId, next)
          if ('error' in result) {
            toast.error(result.error)
            return
          }
          toast.success(next === 'resolved' ? 'Marked resolved' : 'Reopened')
          router.refresh()
        })
      }
    >
      {status === 'open' ? 'Mark resolved' : 'Reopen'}
    </Button>
  )
}
