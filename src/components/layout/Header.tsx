'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Link, useRouter } from '@/i18n/navigation'
import { Menu, User, X, LogOut, Heart, LayoutDashboard } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { CartButton } from './CartButton'
import { LocaleSwitcher } from './LocaleSwitcher'
import { ThemeToggle } from '../theme/ThemeToggle'
import { AuthModal } from '../auth/AuthModal'
import { createClient } from '@/utils/supabase/client'
import { User as SupabaseUser } from '@supabase/supabase-js'
import type { NavCategory } from '@/lib/nav-categories'

/** Categories come from the locale layout, so ones added in the admin appear here. */
export function Header({ categories }: { categories: NavCategory[] }) {
  const t = useTranslations('Header')
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)

  const [user, setUser] = useState<SupabaseUser | null>(null)
  const router = useRouter()
  // Module-level singleton, so this reference is stable across renders.
  const supabase = createClient()

  useEffect(() => {
    let active = true

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (active) setUser(user)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [supabase])

  // Whose admin role was confirmed. Keyed by user id, so a stale answer for a
  // previous session never shows the admin link to the next one. This only
  // decides whether to show a link: /admin checks the role on the server.
  const [adminFor, setAdminFor] = useState<string | null>(null)
  const userId = user?.id ?? null

  useEffect(() => {
    if (!userId) return
    let active = true
    supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (active) setAdminFor(data?.role === 'admin' ? userId : null)
      })
    return () => {
      active = false
    }
  }, [supabase, userId])

  const isAdmin = userId !== null && adminFor === userId

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    // Re-render server components with the cleared session instead of a full
    // page reload, which threw away client state for no reason.
    router.refresh()
  }

  const toggleMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen)
  const closeMenu = () => setIsMobileMenuOpen(false)

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center px-4">

        <Button
          variant="ghost"
          size="icon"
          className="md:hidden mr-2"
          onClick={toggleMenu}
          aria-expanded={isMobileMenuOpen}
          aria-label={isMobileMenuOpen ? t('closeMenu') : t('openMenu')}
        >
          {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>

        <Link href="/" className="mr-6 flex items-center space-x-2" onClick={closeMenu}>
          <span className="font-bold inline-block text-xl">
            NexStore <span className="text-primary">AI</span>
          </span>
        </Link>

        <nav className="hidden md:flex items-center space-x-6 text-sm font-medium">
          {categories.map((c) => (
            <Link key={c.slug} href={`/categories/${c.slug}`} className="transition-colors hover:text-foreground/80 text-foreground/60">{c.name}</Link>
          ))}
        </nav>

        <div className="flex flex-1 items-center justify-end space-x-4">
          <nav className="flex items-center space-x-2">
            <LocaleSwitcher />
            <ThemeToggle />

            {user ? (
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <Link href="/admin" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                    <LayoutDashboard aria-hidden="true" />
                    <span className="hidden sm:inline">{t('admin')}</span>
                    <span className="sr-only sm:hidden">{t('adminPanel')}</span>
                  </Link>
                )}
                <Link href="/wishlist" className={buttonVariants({ variant: 'ghost', size: 'icon' })} title={t('wishlist')}>
                  <Heart className="h-5 w-5" aria-hidden="true" />
                  <span className="sr-only">{t('wishlist')}</span>
                </Link>
                <Link href="/profile" className={buttonVariants({ variant: 'ghost', size: 'icon' })} title={t('profile')}>
                  <User className="h-5 w-5" aria-hidden="true" />
                  <span className="sr-only">{t('profile')}</span>
                </Link>
                <Button variant="ghost" size="icon" onClick={handleSignOut} title={t('signOut')} aria-label={t('signOut')}>
                  <LogOut className="h-5 w-5" />
                </Button>
              </div>
            ) : (
              <Button variant="ghost" size="icon" onClick={() => setIsAuthModalOpen(true)} title={t('signIn')} aria-label={t('signIn')}>
                <User className="h-5 w-5" />
              </Button>
            )}

            <CartButton />
          </nav>
        </div>
      </div>

      {/* Mobile Navigation Dropdown */}
      {isMobileMenuOpen && (
        <div className="md:hidden border-t p-4 bg-background shadow-lg">
          <nav className="flex flex-col space-y-4 text-sm font-medium">
            {categories.map((c) => (
              <Link key={c.slug} href={`/categories/${c.slug}`} onClick={closeMenu} className="transition-colors hover:text-foreground/80 text-foreground/60 p-2 rounded-md hover:bg-muted">{c.name}</Link>
            ))}
            {isAdmin && (
              <Link href="/admin" onClick={closeMenu} className="flex items-center gap-2 border-t pt-4 p-2 rounded-md hover:bg-muted">
                <LayoutDashboard className="size-4" aria-hidden="true" />
                {t('adminPanel')}
              </Link>
            )}
          </nav>
        </div>
      )}

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </header>
  )
}
