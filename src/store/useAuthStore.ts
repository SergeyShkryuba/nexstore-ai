import { create } from 'zustand'

interface User {
  id: string
  email: string
  name: string
}

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  login: (email: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  login: (email: string) => set({ 
    user: { id: 'mock-user-123', email, name: email.split('@')[0] },
    isAuthenticated: true 
  }),
  logout: () => set({ user: null, isAuthenticated: false }),
}))
