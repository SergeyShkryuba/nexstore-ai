import { cn } from '@/lib/utils'
import { SoftPhoto } from '@/components/home/SoftPhoto'

/**
 * A section on a photo, in the same recipe as the search hero: the image under
 * a scrim of the page's background colour, strong enough for text in either
 * theme, with soft edges that fade into the page. Content sits in a narrower
 * column (max-w-7xl) centred on the photo.
 */
export function PhotoSection({
  image,
  className,
  children,
  ...props
}: React.ComponentProps<'section'> & { image: string }) {
  return (
    <section className={cn('relative isolate overflow-hidden', className)} {...props}>
      <SoftPhoto src={image}>
        {/* Light theme: dense at the top, where the heading and its muted link sit,
            thin in the middle so the photo shows through the translucent cards. */}
        <div className="absolute inset-0 bg-linear-to-b from-background/80 via-background/55 to-background/75 dark:from-background/25 dark:via-background/40 dark:to-background/65" />
      </SoftPhoto>
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-8 md:py-14">{children}</div>
    </section>
  )
}
