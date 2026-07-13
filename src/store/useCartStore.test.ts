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
