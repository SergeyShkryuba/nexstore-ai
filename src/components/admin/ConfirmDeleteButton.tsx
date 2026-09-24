'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/**
 * Deleting cannot be undone, so it always goes through a confirmation.
 * `action` is a server action with its id already bound, e.g.
 * `deleteProduct.bind(null, product.id)`.
 */
export function ConfirmDeleteButton({
  action,
  name,
  question,
  consequence,
}: {
  action: () => Promise<{ success: true } | { error: string }>
  /** What is being deleted, as shown to the admin. */
  name: string
  question: string
  consequence: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const confirm = async () => {
    setIsDeleting(true)
    const result = await action()
    setIsDeleting(false)

    if ('error' in result) {
      toast.error(result.error)
      return
    }
    setOpen(false)
    toast.success('Deleted', { description: name })
    router.refresh()
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="text-destructive hover:text-destructive"
        onClick={() => setOpen(true)}
        aria-label={`Delete ${name}`}
      >
        <Trash2 />
      </Button>

      <Dialog open={open} onOpenChange={(next) => !isDeleting && setOpen(next)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{question}</DialogTitle>
            <DialogDescription>
              &ldquo;{name}&rdquo; — {consequence} This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirm} disabled={isDeleting}>
              {isDeleting && <Loader2 className="animate-spin" aria-hidden="true" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
