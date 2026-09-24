'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, ImagePlus, Loader2, Star, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClient } from '@/utils/supabase/client'
import { isAllowedImageUrl, MAX_PRODUCT_IMAGES, PRODUCT_IMAGES_BUCKET } from '@/lib/admin-schemas'
import { cn } from '@/lib/utils'

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif']
const MAX_BYTES = 5 * 1024 * 1024

/**
 * The product's photos, in display order; the first is the main image. Files
 * go straight from the browser to Supabase Storage (the admin's session passes
 * the bucket's RLS), and the form submits only the resulting URLs as repeated
 * `image_urls` fields.
 *
 * Removing a photo only drops it from the product. The file stays in the
 * bucket: until the form is saved, the product still points at it.
 */
export function ImageManager({ initial }: { initial: string[] }) {
  const [urls, setUrls] = useState(initial)
  const [uploading, setUploading] = useState(0)
  const [linkDraft, setLinkDraft] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  const room = MAX_PRODUCT_IMAGES - urls.length

  const upload = async (files: FileList | null) => {
    if (!files?.length) return
    const picked = Array.from(files).slice(0, room)
    if (files.length > room) toast.warning(`Only ${MAX_PRODUCT_IMAGES} images per product`)

    const supabase = createClient()
    setUploading((n) => n + picked.length)

    for (const file of picked) {
      try {
        if (!ACCEPTED_TYPES.includes(file.type)) throw new Error('use JPEG, PNG, WebP or AVIF')
        if (file.size > MAX_BYTES) throw new Error('larger than 5 MB')

        const extension = file.type.split('/')[1]
        const path = `products/${crypto.randomUUID()}.${extension}`
        const { error } = await supabase.storage
          .from(PRODUCT_IMAGES_BUCKET)
          .upload(path, file, { contentType: file.type, cacheControl: '31536000' })
        if (error) throw error

        const { data } = supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(path)
        setUrls((current) => [...current, data.publicUrl])
      } catch (error) {
        toast.error(`${file.name}: ${error instanceof Error ? error.message : 'upload failed'}`)
      } finally {
        setUploading((n) => n - 1)
      }
    }
    if (fileInput.current) fileInput.current.value = ''
  }

  const addLink = () => {
    const url = linkDraft.trim()
    if (!url) return
    if (!isAllowedImageUrl(url)) {
      toast.error('Paste an images.unsplash.com link, or upload the file instead')
      return
    }
    if (urls.includes(url)) {
      toast.info('That image is already on the product')
    } else if (room > 0) {
      setUrls([...urls, url])
    }
    setLinkDraft('')
  }

  const move = (from: number, to: number) => {
    const next = [...urls]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    setUrls(next)
  }

  return (
    <div className="space-y-3">
      {urls.map((url) => (
        <input key={url} type="hidden" name="image_urls" value={url} />
      ))}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {urls.map((url, i) => (
          <div
            key={url}
            className={cn(
              'group relative aspect-square overflow-hidden rounded-lg border bg-muted',
              i === 0 && 'ring-2 ring-primary',
            )}
          >
            <Image src={url} alt={`Product image ${i + 1}`} fill sizes="160px" className="object-cover" />
            {i === 0 && (
              <span className="absolute left-1.5 top-1.5 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                Main
              </span>
            )}
            <Button
              type="button"
              variant="secondary"
              size="icon-xs"
              className="absolute right-1.5 top-1.5"
              onClick={() => setUrls(urls.filter((u) => u !== url))}
              aria-label={`Remove image ${i + 1}`}
            >
              <X />
            </Button>
            <div className="absolute inset-x-1.5 bottom-1.5 flex justify-between gap-1">
              <Button
                type="button"
                variant="secondary"
                size="icon-xs"
                disabled={i === 0}
                onClick={() => move(i, i - 1)}
                aria-label={`Move image ${i + 1} earlier`}
              >
                <ChevronLeft />
              </Button>
              {i !== 0 && (
                <Button
                  type="button"
                  variant="secondary"
                  size="xs"
                  onClick={() => move(i, 0)}
                  aria-label={`Make image ${i + 1} the main image`}
                >
                  <Star /> Main
                </Button>
              )}
              <Button
                type="button"
                variant="secondary"
                size="icon-xs"
                disabled={i === urls.length - 1}
                onClick={() => move(i, i + 1)}
                aria-label={`Move image ${i + 1} later`}
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
        ))}

        {room > 0 && (
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={uploading > 0}
            className="flex aspect-square flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:opacity-60"
          >
            {uploading > 0 ? (
              <>
                <Loader2 className="size-6 animate-spin" aria-hidden="true" />
                Uploading {uploading}…
              </>
            ) : (
              <>
                <ImagePlus className="size-6" aria-hidden="true" />
                Upload photos
              </>
            )}
          </button>
        )}
      </div>

      <input
        ref={fileInput}
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => void upload(e.target.files)}
      />

      {room > 0 && (
        <div className="flex gap-2">
          <Input
            type="url"
            value={linkDraft}
            onChange={(e) => setLinkDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addLink()
              }
            }}
            placeholder="…or paste an images.unsplash.com link"
            aria-label="Image link"
          />
          <Button type="button" variant="outline" onClick={addLink}>
            Add
          </Button>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Up to {MAX_PRODUCT_IMAGES} images, JPEG/PNG/WebP/AVIF, 5 MB each. The first is shown on cards
        and in search.
      </p>
    </div>
  )
}
