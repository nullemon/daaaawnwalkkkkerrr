import { beforeEach, describe, expect, it } from 'vitest'
import {
  API_KEY_REFUSAL,
  announceApiKeyRefusal,
  apiKeyRefused,
  isApiKeyUser,
  resetApiKeyAnnouncements,
} from './api-key'
import { MIN_SECRET_LENGTH } from './policy'

const withRemoteControl = { REMOTE_CONTROL_SECRET: 'x'.repeat(MIN_SECRET_LENGTH) }
const without: Record<string, string | undefined> = {}

describe('API keys where remote control exists', () => {
  it('recognises an API-key request, whatever the strategy is called', () => {
    expect(isApiKeyUser({ _strategy: 'api-key' })).toBe(true)
    // Registered per collection in some versions; a check that stops matching
    // is a refusal that stops refusing.
    expect(isApiKeyUser({ _strategy: 'users-api-key' })).toBe(true)
  })

  it('leaves a signed-in editor alone', () => {
    expect(isApiKeyUser({ _strategy: 'local-jwt', collection: 'users' })).toBe(false)
    expect(isApiKeyUser({ collection: 'users' })).toBe(false)
    expect(isApiKeyUser(null)).toBe(false)
    expect(isApiKeyUser(undefined)).toBe(false)
    expect(apiKeyRefused({ _strategy: 'local-jwt', collection: 'users' }, withRemoteControl)).toBe(
      false,
    )
  })

  it('refuses the key only where the deployment has remote control', () => {
    const key = { _strategy: 'api-key', collection: 'users' }
    expect(apiKeyRefused(key, withRemoteControl)).toBe(true)
    // A deployment that never opted in is untouched: its keys work as they did.
    expect(apiKeyRefused(key, without)).toBe(false)
    // A secret too short to have been generated is not a secret — same rule
    // `remoteSecret` applies everywhere else.
    expect(apiKeyRefused(key, { REMOTE_CONTROL_SECRET: 'short' })).toBe(false)
  })

  it('says why, and says it once', () => {
    resetApiKeyAnnouncements()
    const said: string[] = []
    announceApiKeyRefusal('guides', (message) => said.push(message))
    announceApiKeyRefusal('guides', (message) => said.push(message))
    announceApiKeyRefusal('quests', (message) => said.push(message))
    expect(said).toHaveLength(2)
    expect(said[0]).toContain('pnpm remote connect')
    expect(API_KEY_REFUSAL).toMatch(/not in the Remote log/)
    // The way out is named, and it is turning the feature off rather than a
    // setting that leaves both credentials live.
    expect(API_KEY_REFUSAL).toMatch(/unset REMOTE_CONTROL_SECRET/)
  })
})

beforeEach(() => resetApiKeyAnnouncements())
