import { describe, it, expect, vi, beforeEach } from 'vitest'

const getUser = vi.fn()
const signOut = vi.fn()
vi.mock('@/utils/supabase/server', () => ({ createClient: async () => ({ auth: { getUser, signOut } }) }))

const steps: string[] = []
const deleteSupport = vi.fn()
const deleteUser = vi.fn()
vi.mock('@/utils/supabase/service', () => ({
  createServiceClient: () => ({
    from: (table: string) => ({
      delete: () => ({
        eq: async (column: string, value: string) => {
          steps.push(`delete ${table} where ${column}=${value}`)
          return deleteSupport()
        },
      }),
    }),
    auth: {
      admin: {
        deleteUser: async (id: string) => {
          steps.push(`delete user ${id}`)
          return deleteUser()
        },
      },
    },
  }),
}))

const { deleteAccount } = await import('./account')

beforeEach(() => {
  vi.clearAllMocks()
  steps.length = 0
  vi.spyOn(console, 'error').mockImplementation(() => {})
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  deleteSupport.mockResolvedValue({ error: null })
  deleteUser.mockResolvedValue({ error: null })
  signOut.mockResolvedValue({ error: null })
})

describe('deleteAccount', () => {
  it('removes the support requests, then the user, then the session', async () => {
    expect(await deleteAccount()).toEqual({ success: true })
    expect(steps).toEqual(['delete support_requests where user_id=u1', 'delete user u1'])
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('does nothing without a signed-in user', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    expect(await deleteAccount()).toEqual({ error: 'unauthorized' })
    expect(steps).toEqual([])
  })

  it('keeps the account when the support requests could not be removed', async () => {
    deleteSupport.mockResolvedValue({ error: { code: '500', message: 'down', details: 'Failing row contains (ana@example.com)' } })
    expect(await deleteAccount()).toEqual({ error: 'failed' })
    expect(steps).toEqual(['delete support_requests where user_id=u1'])
    expect(vi.mocked(console.error).mock.calls.flat().join(' ')).not.toContain('ana@example.com')
  })
})
