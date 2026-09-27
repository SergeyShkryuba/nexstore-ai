import Image from 'next/image'

/**
 * A section's background photo with no frame and soft edges: sharp in the
 * middle, slightly out of focus toward the border, fading into the page.
 *
 * A blurred copy lies under the sharp one. The sharp copy fades out first (its
 * own, wider `fade-edges`), so near the rim only the blur is left; then the
 * whole layer fades into the page. Both copies are the same URL: one download.
 * `children` sit on the photo, inside the fade (the scrim goes here).
 */
export function SoftPhoto({ src, children }: { src: string; children?: React.ReactNode }) {
  return (
    <div
      aria-hidden="true"
      className="fade-edges absolute inset-0 -z-10 overflow-hidden [--fade:1.5rem] md:[--fade:3rem]"
    >
      <Image src={src} alt="" fill sizes="100vw" className="object-cover blur-md" />
      <Image
        src={src}
        alt=""
        fill
        sizes="100vw"
        className="fade-edges object-cover [--fade:4rem] md:[--fade:8rem]"
      />
      {children}
    </div>
  )
}
