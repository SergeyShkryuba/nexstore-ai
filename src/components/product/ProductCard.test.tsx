import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ProductCard } from './ProductCard'
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
})
