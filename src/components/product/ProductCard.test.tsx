import { render as rtlRender, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'
import { ProductCard } from './ProductCard'
import { MESSAGES } from '@/i18n/messages'
import type { Locale } from '@/i18n/routing'

// The locale-aware Link reads the current path from the App Router.
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}))

/** Renders inside the same provider the locale layout uses. */
function render(ui: React.ReactElement, locale: Locale = 'en') {
  return rtlRender(
    <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]}>
      {ui}
    </NextIntlClientProvider>,
  )
}
import { useCartStore } from '@/store/useCartStore'
import { toast } from 'sonner'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

// WishlistButton talks to Supabase on mount; the card's own behaviour is what
// is under test here.
vi.mock('./WishlistButton', () => ({
  WishlistButton: () => null,
}))

const mockProduct = {
  id: '123',
  title: 'Awesome Gadget',
  slug: 'awesome-gadget',
  price: 299.99,
  image_urls: ['https://placehold.co/400x400?text=Product'],
}

describe('ProductCard', () => {
  beforeEach(() => {
    // Exercise the real store rather than a stubbed selector: the previous
    // version mocked useCartStore to return the same function for every
    // selector, which would have passed even if the component selected the
    // wrong slice.
    useCartStore.getState().clearCart()
    vi.clearAllMocks()
  })

  afterEach(() => {
    useCartStore.getState().clearCart()
  })

  it('renders the title, formatted price and image', () => {
    render(<ProductCard product={mockProduct} />)

    expect(screen.getByRole('heading', { name: 'Awesome Gadget' })).toBeInTheDocument()
    expect(screen.getByText('€299.99')).toBeInTheDocument()
    expect(screen.getByAltText('Awesome Gadget')).toBeInTheDocument()
  })

  it('links to the product detail page', () => {
    render(<ProductCard product={mockProduct} />)

    expect(screen.getByRole('link')).toHaveAttribute('href', '/product/awesome-gadget')
  })

  it('adds the product to the cart and confirms with a toast', async () => {
    const user = userEvent.setup()
    render(<ProductCard product={mockProduct} />)

    await user.click(screen.getByRole('button', { name: /add to cart/i }))

    expect(useCartStore.getState().items).toEqual([
      {
        id: '123',
        title: 'Awesome Gadget',
        price: 299.99,
        quantity: 1,
        image_url: 'https://placehold.co/400x400?text=Product',
      },
    ])
    expect(toast.success).toHaveBeenCalledWith('Added to cart', { description: 'Awesome Gadget' })
  })

  it('renders a placeholder instead of crashing when the product has no image', () => {
    render(<ProductCard product={{ ...mockProduct, image_urls: [] }} />)

    expect(screen.getByText('No image available')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('tolerates a null image_urls column', () => {
    render(<ProductCard product={{ ...mockProduct, image_urls: null }} />)

    expect(screen.getByRole('heading', { name: 'Awesome Gadget' })).toBeInTheDocument()
  })

  it('marks a sold-out product and does not add it to the cart', async () => {
    const user = userEvent.setup()
    render(<ProductCard product={{ ...mockProduct, inventory_count: 0 }} />)

    const button = screen.getByRole('button', { name: /sold out/i })
    expect(button).toBeDisabled()
    await user.click(button)
    expect(useCartStore.getState().items).toEqual([])
  })

  it('shows no stock state when the caller did not select stock', () => {
    render(<ProductCard product={mockProduct} />)

    expect(screen.queryByText(/sold out/i)).not.toBeInTheDocument()
  })

  it('speaks the visitor’s language: Spanish labels and price format, prefixed link', () => {
    render(<ProductCard product={mockProduct} />, 'es')

    expect(screen.getByRole('button', { name: /añadir al carrito/i })).toBeInTheDocument()
    expect(screen.getByText('299,99 €')).toBeInTheDocument()
    expect(screen.getByRole('link')).toHaveAttribute('href', '/es/product/awesome-gadget')
  })
})
