import Image from 'next/image'
import { cn } from '@/lib/utils'

/**
 * A section on a photo, in the same recipe as the search hero: the image under
 * a scrim of the page's background colour, strong enough for text in either
 * theme. Content sits in a narrower column (max-w-7xl) centred on the photo.
 */
export function PhotoSection({
  image,
  className,
  children,
  ...props
}: React.ComponentProps<'section'> & { image: string }) {
  return (
    <section
      className={cn('relative isolate overflow-hidden rounded-3xl border border-border/50', className)}
      {...props}
    >
      <div aria-hidden="true" className="absolute inset-0 -z-10">
        <Image src={image} alt="" fill sizes="100vw" className="object-cover" />
        <div className="absolute inset-0 bg-linear-to-b from-background/70 via-background/80 to-background/90" />
      </div>
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-8 md:py-14">{children}</div>
    </section>
  )
}
