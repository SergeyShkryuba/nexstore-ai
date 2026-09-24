import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// The session (who is signed in) and their role are stubbed per test.
let user: { id: string } | null = null
let role: string | null = null
const roleLookup = vi.fn()

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            roleLookup()
            return { data: role ? { role } : null }
          },
        }),
      }),
    }),
  }),
}))

const { updateSession } = await import('./middleware')

const visit = (path: string) => updateSession(new NextRequest(new URL(path, 'https://shop.test')))

const isRedirectHome = (res: Response) =>
  res.status === 307 && new URL(res.headers.get('location')!).pathname === '/'

beforeEach(() => {
  user = null
  role = null
  roleLookup.mockClear()
})

describe('proxy access rules', () => {
  it.each(['/admin', '/admin/products', '/admin/orders', '/admin/categories/new'])(
    'sends a signed-out visitor away from %s before it renders',
    async (path) => {
      expect(isRedirectHome(await visit(path))).toBe(true)
    },
  )

  it('sends a signed-in customer away from the admin panel', async () => {
    user = { id: 'u1' }
    role = 'user'
    expect(isRedirectHome(await visit('/admin/orders'))).toBe(true)
  })

  it('treats a missing profile as not an admin', async () => {
    user = { id: 'u1' }
    role = null
    expect(isRedirectHome(await visit('/admin'))).toBe(true)
  })

  it('lets an admin through', async () => {
    user = { id: 'a1' }
    role = 'admin'
    const res = await visit('/admin/products')
    expect(res.status).toBe(200)
    expect(res.headers.get('location')).toBeNull()
  })

  it('guards the account pages for signed-out visitors only', async () => {
    expect(isRedirectHome(await visit('/profile/orders/123'))).toBe(true)
    user = { id: 'u1' }
    expect((await visit('/profile')).status).toBe(200)
  })

  it('does not look up roles, or block, outside /admin', async () => {
    for (const path of ['/', '/administrator', '/categories/all']) {
      expect((await visit(path)).status).toBe(200)
    }
    expect(roleLookup).not.toHaveBeenCalled()
  })
})
