import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { cartLineKey } from '@/lib/variants'

export type CartItem = {
  /** Product id. */
  id: string
  title: string
  price: number
  quantity: number
  image_url?: string
  /** Set for products sold in sizes. */
  variantId?: string
  size?: string
}

/** Identifies a cart line: product plus size, since M and L are separate lines. */
export const lineKey = (item: Pick<CartItem, 'id' | 'variantId'>) => cartLineKey(item.id, item.variantId)

interface CartState {
  items: CartItem[]
  addItem: (item: CartItem) => void
  /** `key` is `lineKey(item)`; a plain product id still works for unsized items. */
  removeItem: (key: string) => void
  updateQuantity: (key: string, quantity: number) => void
  clearCart: () => void
  totalItems: () => number
  totalPrice: () => number
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (newItem) => {
        set((state) => {
          const key = lineKey(newItem)
          const existing = state.items.find((i) => lineKey(i) === key)
          if (existing) {
            return {
              items: state.items.map((i) =>
                lineKey(i) === key ? { ...i, quantity: i.quantity + newItem.quantity } : i
              ),
            }
          }
          return { items: [...state.items, newItem] }
        })
      },
      removeItem: (key) => {
        set((state) => ({
          items: state.items.filter((i) => lineKey(i) !== key),
        }))
      },
      updateQuantity: (key, quantity) => {
        set((state) => ({
          items: state.items.map((i) =>
            lineKey(i) === key ? { ...i, quantity: Math.max(0, quantity) } : i
          ).filter(i => i.quantity > 0),
        }))
      },
      clearCart: () => set({ items: [] }),
      totalItems: () => get().items.reduce((acc, item) => acc + item.quantity, 0),
      totalPrice: () => get().items.reduce((acc, item) => acc + (item.price * item.quantity), 0),
    }),
    {
      name: 'nexstore-cart',
    }
  )
)
