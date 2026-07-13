'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Menu, User, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CartButton } from './CartButton'
import { ThemeToggle } from '../theme/ThemeToggle'

export function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

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
            <Button variant="ghost" size="icon">
              <User className="h-5 w-5" />
              <span className="sr-only">Profile</span>
            </Button>
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
          </nav>
        </div>
      )}
    </header>
  )
}
