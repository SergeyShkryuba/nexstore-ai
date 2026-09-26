import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { buttonVariants } from '@/components/ui/button'

export default async function NotFound() {
  const t = await getTranslations('NotFound')
  return (
    <div className="container mx-auto flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="font-mono text-sm text-muted-foreground">404</p>
      <h1 className="text-3xl font-bold">{t('title')}</h1>
      <p className="max-w-md text-muted-foreground">{t('description')}</p>
      <div className="flex gap-3">
        <Link href="/" className={buttonVariants()}>
          {t('home')}
        </Link>
        <Link href="/categories/all" className={buttonVariants({ variant: 'outline' })}>
          {t('browse')}
        </Link>
      </div>
    </div>
  )
}
