import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ProductCard } from './ProductCard'
import { useCartStore } from '@/store/useCartStore'
import { toast } from 'sonner'

// Mock the cart store and sonner
vi.mock('@/store/useCartStore', () => ({
  useCartStore: vi.fn()
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn()
  }
}))

const mockProduct = {
  id: '123',
  title: 'Awesome Gadget',
  slug: 'awesome-gadget',
  price: 299.99,
  image_urls: ['https://placehold.co/400x400?text=Product']
}

describe('ProductCard', () => {
  let addItemMock: any

  beforeEach(() => {
    addItemMock = vi.fn()
    // Setup Zustand mock return value
    vi.mocked(useCartStore).mockImplementation((selector: any) => {
      // Mock selector behavior: we are selecting state.addItem in the component
      return addItemMock
    })
    vi.clearAllMocks()
  })

  it('renders product details correctly', () => {
    render(<ProductCard product={mockProduct} />)
    
    expect(screen.getByText('Awesome Gadget')).toBeInTheDocument()
    expect(screen.getByText('$299.99')).toBeInTheDocument()
    expect(screen.getByAltText('Awesome Gadget')).toBeInTheDocument()
  })

  it('adds item to cart and shows toast on click', () => {
    render(<ProductCard product={mockProduct} />)
    
    const addButton = screen.getByRole('button', { name: /add to cart/i })
    fireEvent.click(addButton)
    
    expect(addItemMock).toHaveBeenCalledWith({
      id: '123',
      title: 'Awesome Gadget',
      price: 299.99,
      quantity: 1,
      image_url: 'https://placehold.co/400x400?text=Product'
    })
    
    expect(toast.success).toHaveBeenCalledWith('Added to cart', { description: 'Awesome Gadget' })
  })
})
