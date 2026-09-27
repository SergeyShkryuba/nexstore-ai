'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from '@/i18n/navigation'
import { deleteAccount } from '@/app/actions/account'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { announceSignOut } from '@/lib/session-events'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/** "Delete my account", behind a confirmation that says what goes and what stays. */
export function DeleteAccount() {
  const t = useTranslations('Profile.deleteAccount')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const confirm = async () => {
    setDeleting(true)
    const result = await deleteAccount()
    setDeleting(false)
    if ('error' in result) {
      toast.error(t(result.error === 'unauthorized' ? 'signedOut' : 'failed'))
      return
    }
    setOpen(false)
    announceSignOut()
    toast.success(t('done'))
    router.push('/')
    router.refresh()
  }

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="text-base">{t('title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">{t('intro')}</p>
        <Button variant="destructive" onClick={() => setOpen(true)}>
          {t('button')}
        </Button>
      </CardContent>

      <Dialog open={open} onOpenChange={(next) => !deleting && setOpen(next)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('confirmTitle')}</DialogTitle>
            <DialogDescription>{t('confirmText')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={deleting}>
              {t('cancel')}
            </Button>
            <Button variant="destructive" onClick={confirm} disabled={deleting}>
              {deleting && <Loader2 className="animate-spin" aria-hidden="true" />}
              {t('confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
