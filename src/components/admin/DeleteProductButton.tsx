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
import { deleteProduct } from '@/app/actions/admin'

/** Deleting cannot be undone, so it always goes through a confirmation. */
export function DeleteProductButton({ productId, title }: { productId: string; title: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const confirm = async () => {
    setIsDeleting(true)
    const result = await deleteProduct(productId)
    setIsDeleting(false)

    if ('error' in result) {
      toast.error(result.error)
      return
    }
    setOpen(false)
    toast.success('Product deleted', { description: title })
    router.refresh()
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="text-destructive hover:text-destructive"
        onClick={() => setOpen(true)}
        aria-label={`Delete ${title}`}
      >
        <Trash2 />
      </Button>

      <Dialog open={open} onOpenChange={(next) => !isDeleting && setOpen(next)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this product?</DialogTitle>
            <DialogDescription>
              &ldquo;{title}&rdquo; will disappear from the store and from search. Past orders keep
              their line items. This cannot be undone.
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
