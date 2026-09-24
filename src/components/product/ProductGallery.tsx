'use client'

import { useState, type KeyboardEvent } from 'react'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, ImageOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

interface ProductGalleryProps {
  images: string[]
  title: string
}

/** Main image with thumbnails and a full-size view; arrow keys step through the images. */
export function ProductGallery({ images, title }: ProductGalleryProps) {
  const [index, setIndex] = useState(0)
  const [zoomed, setZoomed] = useState(false)
  const count = images.length

  if (count === 0) {
    return (
      <div className="aspect-square bg-muted rounded-2xl border flex flex-col items-center justify-center gap-2 text-muted-foreground">
        <ImageOff className="h-8 w-8" aria-hidden="true" />
        No image available
      </div>
    )
  }

  const go = (step: number) => setIndex((i) => (i + step + count) % count)

  const onKeyDown = (e: KeyboardEvent) => {
    if (count < 2 || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return
    e.preventDefault()
    // Handled once: the dialog's handler must not also reach the page wrapper.
    e.stopPropagation()
    go(e.key === 'ArrowRight' ? 1 : -1)
  }

  const alt = `${title}, image ${index + 1} of ${count}`

  const arrows = count > 1 && (
    <>
      <Button
        variant="secondary"
        size="icon-lg"
        className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full opacity-90 shadow"
        onClick={() => go(-1)}
        aria-label="Previous image"
      >
        <ChevronLeft />
      </Button>
      <Button
        variant="secondary"
        size="icon-lg"
        className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full opacity-90 shadow"
        onClick={() => go(1)}
        aria-label="Next image"
      >
        <ChevronRight />
      </Button>
    </>
  )

  return (
    <div className="space-y-4" onKeyDown={onKeyDown}>
      <div className="aspect-square bg-muted rounded-2xl overflow-hidden border relative">
        <button
          type="button"
          className="absolute inset-0 cursor-zoom-in focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          onClick={() => setZoomed(true)}
          aria-label={`Open full size: ${alt}`}
        >
          <Image
            src={images[index]}
            alt={alt}
            fill
            priority={index === 0}
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-cover"
          />
        </button>
        {arrows}
        {count > 1 && (
          <span className="absolute bottom-3 right-3 rounded-md bg-background/80 px-2 py-0.5 text-xs tabular-nums">
            {index + 1} / {count}
          </span>
        )}
      </div>

      {count > 1 && (
        <div className="grid grid-cols-5 gap-3">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Show image ${i + 1} of ${count}`}
              aria-current={i === index ? 'true' : undefined}
              className={cn(
                'relative aspect-square overflow-hidden rounded-lg border-2 bg-muted transition-opacity',
                i === index ? 'border-primary' : 'border-transparent opacity-60 hover:opacity-100',
              )}
            >
              <Image src={src} alt="" fill sizes="120px" className="object-cover" />
            </button>
          ))}
        </div>
      )}

      <Dialog open={zoomed} onOpenChange={(open) => setZoomed(open)}>
        {/* The dialog keeps key events to itself, so it needs its own handler. */}
        <DialogContent className="w-auto max-w-none sm:max-w-none p-2" onKeyDown={onKeyDown}>
          <DialogTitle className="sr-only">{title}</DialogTitle>
          {/* Square, and as large as fits both the width and the height of the viewport. */}
          <div className="relative aspect-square w-[min(90vw,85vh,56rem)]">
            <Image
              src={images[index]}
              alt={alt}
              fill
              sizes="(max-width: 896px) 100vw, 896px"
              className="object-contain"
            />
            {arrows}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
