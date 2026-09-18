'use client'

import { useSyncExternalStore } from 'react'
import { useCartStore } from './useCartStore'

/**
 * Has the persisted cart finished loading from localStorage?
 *
 * The cart is server-rendered empty and only filled once zustand rehydrates, so
 * rendering it before that produces a hydration mismatch. Components used to
 * work around this with a `mounted` flag set inside an effect — which the
 * `react-hooks/set-state-in-effect` rule flags, and which fires a second render
 * on every mount.
 *
 * `useSyncExternalStore` subscribes to zustand's own hydration signal instead:
 * no extra state, and the server snapshot is `false` by construction.
 */
export function useCartHydrated(): boolean {
  return useSyncExternalStore(
    (onStoreChange) => useCartStore.persist.onFinishHydration(onStoreChange),
    () => useCartStore.persist.hasHydrated(),
    () => false,
  )
}
