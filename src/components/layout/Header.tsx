'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Menu, User, X, LogOut, Heart, LayoutDashboard } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { CartButton } from './CartButton'
import { ThemeToggle } from '../theme/ThemeToggle'
import { AuthModal } from '../auth/AuthModal'
import { createClient } from '@/utils/supabase/client'
import { User as SupabaseUser } from '@supabase/supabase-js'

export function Header() {
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
        
        <Button variant="ghost" size="icon" className="md:hidden mr-2" onClick={toggleMenu}>
          {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>

        <Link href="/" className="mr-6 flex items-center space-x-2" onClick={closeMenu}>
          <span className="font-bold inline-block text-xl">
            NexStore <span className="text-primary">AI</span>
          </span>
        </Link>

        <nav className="hidden md:flex items-center space-x-6 text-sm font-medium">
          <Link href="/categories/electronics" className="transition-colors hover:text-foreground/80 text-foreground/60">Electronics</Link>
          <Link href="/categories/clothing" className="transition-colors hover:text-foreground/80 text-foreground/60">Clothing</Link>
          <Link href="/categories/smart-home" className="transition-colors hover:text-foreground/80 text-foreground/60">Smart Home</Link>
        </nav>

        <div className="flex flex-1 items-center justify-end space-x-4">
          <nav className="flex items-center space-x-2">
            <ThemeToggle />
            
            {user ? (
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <Link href="/admin" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                    <LayoutDashboard aria-hidden="true" />
                    <span className="hidden sm:inline">Admin</span>
                    <span className="sr-only sm:hidden">Admin panel</span>
                  </Link>
                )}
                <Link href="/wishlist">
                  <Button variant="ghost" size="icon" title="Wishlist">
                    <Heart className="h-5 w-5" />
                  </Button>
                </Link>
                <Link href="/profile">
                  <Button variant="ghost" size="icon" title="Profile">
                    <User className="h-5 w-5" />
                  </Button>
                </Link>
                <Button variant="ghost" size="icon" onClick={handleSignOut} title="Sign Out">
                  <LogOut className="h-5 w-5" />
                </Button>
              </div>
            ) : (
              <Button variant="ghost" size="icon" onClick={() => setIsAuthModalOpen(true)} title="Sign In">
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
            <Link href="/categories/electronics" onClick={closeMenu} className="transition-colors hover:text-foreground/80 text-foreground/60 p-2 rounded-md hover:bg-muted">Electronics</Link>
            <Link href="/categories/clothing" onClick={closeMenu} className="transition-colors hover:text-foreground/80 text-foreground/60 p-2 rounded-md hover:bg-muted">Clothing</Link>
            <Link href="/categories/smart-home" onClick={closeMenu} className="transition-colors hover:text-foreground/80 text-foreground/60 p-2 rounded-md hover:bg-muted">Smart Home</Link>
            {isAdmin && (
              <Link href="/admin" onClick={closeMenu} className="flex items-center gap-2 border-t pt-4 p-2 rounded-md hover:bg-muted">
                <LayoutDashboard className="size-4" aria-hidden="true" />
                Admin panel
              </Link>
            )}
          </nav>
        </div>
      )}
      
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </header>
  )
}
