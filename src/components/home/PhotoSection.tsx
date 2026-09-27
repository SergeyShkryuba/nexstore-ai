import Image from 'next/image'
import { cn } from '@/lib/utils'

/**
 * A section on a photo, in the same recipe as the search hero: the image under
 * a scrim of the page's background colour, strong enough for text in either
 * theme. No frame: the photo fades into the page on every side. Content sits
 * in a narrower column (max-w-7xl) centred on the photo.
 */
export function PhotoSection({
  image,
  className,
  children,
  ...props
}: React.ComponentProps<'section'> & { image: string }) {
  return (
    <section className={cn('relative isolate overflow-hidden', className)} {...props}>
      <div aria-hidden="true" className="fade-edges absolute inset-0 -z-10 [--fade:1rem] md:[--fade:2rem]">
        <Image src={image} alt="" fill sizes="100vw" className="object-cover" />
        {/* Light theme: dense at the top, where the heading and its muted link sit,
            thin in the middle so the photo shows through the translucent cards. */}
        <div className="absolute inset-0 bg-linear-to-b from-background/80 via-background/55 to-background/75 dark:from-background/25 dark:via-background/40 dark:to-background/65" />
      </div>
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-8 md:py-14">{children}</div>
    </section>
  )
}
