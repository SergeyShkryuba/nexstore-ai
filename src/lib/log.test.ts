import { describe, it, expect } from 'vitest'
import { loggable } from './log'

describe('loggable', () => {
  it('keeps the code and message of a database error and drops the failing row', () => {
    const error = {
      code: '23514',
      message: 'new row for relation "support_requests" violates check constraint',
      details: 'Failing row contains (ana@example.com, My parcel arrived damaged)',
      hint: null,
    }
    const logged = loggable(error)
    expect(logged).toBe('23514: new row for relation "support_requests" violates check constraint')
    expect(logged).not.toContain('ana@example.com')
  })

  it('reads plain errors and anything else', () => {
    expect(loggable(new TypeError('fetch failed'))).toBe('TypeError: fetch failed')
    expect(loggable('boom')).toBe('boom')
  })
})
