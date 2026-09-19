import { generateKeyPairSync, randomBytes, sign } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { CLOCK_SKEW_MS } from './policy'
import { HEADER, canonicalString, checkSignature, forgetNonces } from './signing'

/**
 * Both directions, because a signature check is the one piece here that fails
 * open if it is subtly wrong: a verifier that returns true for everything
 * looks identical in a passing test to one that works.
 */

const keypair = () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  return {
    privateKey,
    publicKey: publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
  }
}

const device = keypair()
const other = keypair()

const PATH = '/api/remote/op'

const headersFor = (options: {
  key?: string
  body?: string
  path?: string
  method?: string
  timestamp?: number
  nonce?: string
  signWith?: ReturnType<typeof keypair>['privateKey']
  signature?: string
}): Headers => {
  const body = options.body ?? '{"op":"whoami"}'
  const timestamp = options.timestamp ?? Date.now()
  const nonce = options.nonce ?? randomBytes(16).toString('hex')
  const message = canonicalString({
    method: options.method ?? 'POST',
    path: options.path ?? PATH,
    timestamp,
    nonce,
    body,
  })
  const signature =
    options.signature ??
    sign(null, Buffer.from(message, 'utf8'), options.signWith ?? device.privateKey).toString('base64')

  return new Headers({
    [HEADER.key]: options.key ?? device.publicKey,
    [HEADER.timestamp]: String(timestamp),
    [HEADER.nonce]: nonce,
    [HEADER.signature]: signature,
  })
}

beforeEach(() => forgetNonces())

describe('a request signed properly', () => {
  it('verifies, and hands back the key that signed it', () => {
    const body = '{"op":"whoami"}'
    const result = checkSignature(headersFor({ body }), 'POST', PATH, body)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.publicKey).toBe(device.publicKey)
  })
})

describe('everything that must not verify', () => {
  const body = '{"op":"whoami"}'

  it('refuses an unsigned request', () => {
    expect(checkSignature(new Headers(), 'POST', PATH, body).ok).toBe(false)
  })

  it('refuses a signature from a different key', () => {
    const headers = headersFor({ body, signWith: other.privateKey })
    expect(checkSignature(headers, 'POST', PATH, body).ok).toBe(false)
  })

  it('refuses when the key header does not match the key that signed', () => {
    // The signature verifies against the key in the header, so swapping one
    // has to fail — otherwise the header would be the whole identity.
    const headers = headersFor({ body, key: other.publicKey })
    expect(checkSignature(headers, 'POST', PATH, body).ok).toBe(false)
  })

  it('refuses a body that changed after signing', () => {
    const headers = headersFor({ body })
    expect(checkSignature(headers, 'POST', PATH, '{"op":"delete"}').ok).toBe(false)
  })

  it('refuses a signature captured from another endpoint', () => {
    const headers = headersFor({ body, path: '/api/remote/poll' })
    expect(checkSignature(headers, 'POST', PATH, body).ok).toBe(false)
  })

  it('refuses a signature captured from another method', () => {
    const headers = headersFor({ body, method: 'GET' })
    expect(checkSignature(headers, 'POST', PATH, body).ok).toBe(false)
  })

  it('refuses a stale timestamp, in both directions', () => {
    const old = checkSignature(
      headersFor({ body, timestamp: Date.now() - CLOCK_SKEW_MS - 5_000 }),
      'POST',
      PATH,
      body,
    )
    expect(old.ok).toBe(false)
    if (!old.ok) expect(old.reason).toMatch(/clock/)

    const future = checkSignature(
      headersFor({ body, timestamp: Date.now() + CLOCK_SKEW_MS + 5_000 }),
      'POST',
      PATH,
      body,
    )
    expect(future.ok).toBe(false)
  })

  it('refuses the same request twice', () => {
    const headers = headersFor({ body })
    expect(checkSignature(headers, 'POST', PATH, body).ok).toBe(true)
    const replayed = checkSignature(headers, 'POST', PATH, body)
    expect(replayed.ok).toBe(false)
    if (!replayed.ok) expect(replayed.reason).toMatch(/already been seen/)
  })

  it('refuses a nonce that is not our own shape', () => {
    expect(checkSignature(headersFor({ body, nonce: 'hello' }), 'POST', PATH, body).ok).toBe(false)
  })

  it('refuses a public key it cannot read, and one of the wrong type', () => {
    expect(checkSignature(headersFor({ body, key: 'not-a-key' }), 'POST', PATH, body).ok).toBe(false)

    const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const rsaKey = rsa.publicKey.export({ format: 'der', type: 'spki' }).toString('base64')
    const result = checkSignature(headersFor({ body, key: rsaKey }), 'POST', PATH, body)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/Ed25519/)
  })

  it('refuses a malformed signature without throwing', () => {
    const headers = headersFor({ body, signature: 'nonsense' })
    expect(checkSignature(headers, 'POST', PATH, body).ok).toBe(false)
  })
})

describe('the canonical string', () => {
  it('carries its version, so a future change fails rather than being reinterpreted', () => {
    const line = canonicalString({
      method: 'post',
      path: PATH,
      timestamp: 1,
      nonce: 'abc',
      body: '',
    })
    const parts = line.split('\n')
    expect(parts[0]).toBe('remote-v1')
    expect(parts[1]).toBe('POST')
    expect(parts[2]).toBe(PATH)
    expect(parts).toHaveLength(6)
  })
})
