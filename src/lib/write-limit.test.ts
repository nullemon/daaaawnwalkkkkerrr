import { describe, expect, it } from 'vitest'
import { createLimiter, limitPublicWrites } from './write-limit'

const req = (headers: Record<string, string>, user?: unknown) => ({
  headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
  user,
})

describe('createLimiter', () => {
  it('allows the per-address allowance and refuses the next one', () => {
    const limiter = createLimiter({ perAddress: 3, perProcess: 100 })
    expect(limiter.limited('a', 0)).toBe(false)
    expect(limiter.limited('a', 0)).toBe(false)
    expect(limiter.limited('a', 0)).toBe(false)
    expect(limiter.limited('a', 0)).toBe(true)
    // Another address has its own bucket.
    expect(limiter.limited('b', 0)).toBe(false)
  })

  it('opens again once the window has passed', () => {
    const limiter = createLimiter({ perAddress: 1, perProcess: 100 })
    expect(limiter.limited('a', 0)).toBe(false)
    expect(limiter.limited('a', 1_000)).toBe(true)
    expect(limiter.limited('a', 61_000)).toBe(false)
  })

  it('the process ceiling holds against a fresh address per request', () => {
    const limiter = createLimiter({ perAddress: 1000, perProcess: 5 })
    for (let i = 0; i < 5; i += 1) expect(limiter.limited(`forged-${i}`, 0)).toBe(false)
    expect(limiter.limited('forged-next', 0)).toBe(true)
  })
})

describe('limitPublicWrites', () => {
  it('throws a 429 past the allowance for an anonymous create', async () => {
    const hook = limitPublicWrites({ perAddress: 1, perProcess: 100 })
    await expect(hook({ operation: 'create', req: req({ 'x-forwarded-for': '203.0.113.9' }) })).resolves.toBeUndefined()
    await expect(hook({ operation: 'create', req: req({ 'x-forwarded-for': '203.0.113.9' }) })).rejects.toMatchObject({
      status: 429,
    })
  })

  it('guards forgot-password as well, and nothing else', async () => {
    const hook = limitPublicWrites({ perAddress: 1, perProcess: 100 })
    const r = () => req({ 'x-forwarded-for': '203.0.113.9' })
    await hook({ operation: 'forgotPassword', req: r() })
    await expect(hook({ operation: 'forgotPassword', req: r() })).rejects.toMatchObject({ status: 429 })
    await expect(hook({ operation: 'read', req: r() })).resolves.toBeUndefined()
    await expect(hook({ operation: 'update', req: r() })).resolves.toBeUndefined()
  })

  it('never limits a signed-in editor', async () => {
    const hook = limitPublicWrites({ perAddress: 1, perProcess: 100 })
    const editor = { collection: 'users', id: 1 }
    for (let i = 0; i < 5; i += 1) {
      await expect(hook({ operation: 'create', req: req({ 'x-forwarded-for': '203.0.113.9' }, editor) })).resolves.toBeUndefined()
    }
  })

  it('a reader account is limited like anyone else', async () => {
    const hook = limitPublicWrites({ perAddress: 1, perProcess: 100 })
    const player = { collection: 'players', id: 1 }
    await hook({ operation: 'create', req: req({ 'x-forwarded-for': '203.0.113.9' }, player) })
    await expect(hook({ operation: 'create', req: req({ 'x-forwarded-for': '203.0.113.9' }, player) })).rejects.toMatchObject({
      status: 429,
    })
  })
})
