/**
 * Tells the rest of the page that the user has signed out (or deleted their
 * account), so per-tab state that may show their data, such as the chat with
 * its order cards, is cleared for whoever uses the browser next.
 */
export const SIGNED_OUT_EVENT = 'nexstore:signed-out'

export function announceSignOut(): void {
  window.dispatchEvent(new Event(SIGNED_OUT_EVENT))
}
