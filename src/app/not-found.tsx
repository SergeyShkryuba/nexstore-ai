import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="container mx-auto flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="font-mono text-sm text-muted-foreground">404</p>
      <h1 className="text-3xl font-bold">We couldn&apos;t find that page</h1>
      <p className="max-w-md text-muted-foreground">
        The product or category you followed may have been removed or renamed.
      </p>
      <div className="flex gap-3">
        <Link href="/" className={buttonVariants()}>
          Go home
        </Link>
        <Link href="/categories/all" className={buttonVariants({ variant: 'outline' })}>
          Browse all products
        </Link>
      </div>
    </div>
  )
}
