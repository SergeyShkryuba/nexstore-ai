import { describe, it, expect, beforeEach } from 'vitest'
import { useCartStore } from './useCartStore'

describe('useCartStore', () => {
  beforeEach(() => {
    // Reset store before each test
    useCartStore.getState().clearCart()
  })

  it('should initialize with an empty cart', () => {
    const { items, totalPrice } = useCartStore.getState()
    expect(items).toEqual([])
    expect(totalPrice()).toBe(0)
  })

  it('should add an item to the cart', () => {
    const item = { id: '1', title: 'Test Product', price: 100, quantity: 1 }
    useCartStore.getState().addItem(item)

    const { items } = useCartStore.getState()
    expect(items).toHaveLength(1)
    expect(items[0]).toEqual(item)
  })

  it('should increment quantity if the same item is added again', () => {
    const item = { id: '1', title: 'Test Product', price: 100, quantity: 1 }
    useCartStore.getState().addItem(item)
    useCartStore.getState().addItem(item)

    const { items } = useCartStore.getState()
    expect(items).toHaveLength(1)
    expect(items[0].quantity).toBe(2)
  })

  it('should remove an item from the cart', () => {
    const item = { id: '1', title: 'Test Product', price: 100, quantity: 1 }
    useCartStore.getState().addItem(item)
    useCartStore.getState().removeItem('1')

    const { items } = useCartStore.getState()
    expect(items).toHaveLength(0)
  })

  it('should update quantity correctly', () => {
    const item = { id: '1', title: 'Test Product', price: 100, quantity: 1 }
    useCartStore.getState().addItem(item)
    useCartStore.getState().updateQuantity('1', 5)

    const { items } = useCartStore.getState()
    expect(items[0].quantity).toBe(5)
  })

  it('should remove item if quantity is updated to 0', () => {
    const item = { id: '1', title: 'Test Product', price: 100, quantity: 1 }
    useCartStore.getState().addItem(item)
    useCartStore.getState().updateQuantity('1', 0)

    const { items } = useCartStore.getState()
    expect(items).toHaveLength(0)
  })

  it('should calculate total price correctly', () => {
    useCartStore.getState().addItem({ id: '1', title: 'A', price: 100, quantity: 2 })
    useCartStore.getState().addItem({ id: '2', title: 'B', price: 50, quantity: 1 })

    const totalPrice = useCartStore.getState().totalPrice()
    expect(totalPrice).toBe(250)
  })
})

describe('useCartStore — edge cases', () => {
  beforeEach(() => {
    useCartStore.getState().clearCart()
  })

  it('keeps the existing title and price when the same id is added again', () => {
    useCartStore.getState().addItem({ id: '1', title: 'Original', price: 100, quantity: 1 })
    useCartStore.getState().addItem({ id: '1', title: 'Renamed', price: 1, quantity: 2 })

    const [item] = useCartStore.getState().items
    expect(item.quantity).toBe(3)
    // The cart is a local convenience; the server re-reads price at checkout,
    // so a stale local price must never become authoritative.
    expect(item.title).toBe('Original')
    expect(item.price).toBe(100)
  })

  it('never stores a negative quantity', () => {
    useCartStore.getState().addItem({ id: '1', title: 'A', price: 10, quantity: 1 })
    useCartStore.getState().updateQuantity('1', -5)

    expect(useCartStore.getState().items).toHaveLength(0)
  })

  it('ignores updates for ids that are not in the cart', () => {
    useCartStore.getState().addItem({ id: '1', title: 'A', price: 10, quantity: 1 })
    useCartStore.getState().updateQuantity('nope', 9)
    useCartStore.getState().removeItem('nope')

    expect(useCartStore.getState().items).toHaveLength(1)
  })

  it('counts total items across distinct products', () => {
    useCartStore.getState().addItem({ id: '1', title: 'A', price: 10, quantity: 2 })
    useCartStore.getState().addItem({ id: '2', title: 'B', price: 10, quantity: 3 })

    expect(useCartStore.getState().totalItems()).toBe(5)
  })

  it('handles floating point totals without drift', () => {
    useCartStore.getState().addItem({ id: '1', title: 'A', price: 19.9, quantity: 3 })

    expect(useCartStore.getState().totalPrice()).toBeCloseTo(59.7, 10)
  })
})
