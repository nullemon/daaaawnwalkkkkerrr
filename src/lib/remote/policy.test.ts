import { describe, expect, it } from 'vitest'
import {
  CAPABILITIES,
  DEFAULT_IDLE_MS,
  DEFAULT_SESSION_MS,
  DENIED_COLLECTIONS,
  MAX_SESSION_MS,
  MIN_SECRET_LENGTH,
  MINUTE,
  OPS,
  SCOPES,
  type Capability,
  capabilitiesForScope,
  capabilityFor,
  capabilityRefusal,
  collectionAllowed,
  collectionRefusal,
  describeCapabilities,
  grantedCapabilities,
  idleTimeoutMs,
  isCapability,
  isOp,
  isScope,
  orderCapabilities,
  parseCapabilities,
  presetName,
  remoteAvailable,
  remoteSecret,
  sessionCan,
  sessionLifetimeMs,
} from './policy'

/*
  Both directions, every time.

  A granted capability has to work and an ungranted one has to be refused, and
  the tests below pin each op against each capability rather than sampling —
  this is the "Antar 4" rule from CLAUDE.md applied to an authorisation check:
  a filter written to stop bad input throws away good input just as silently,
  and a permission that quietly refuses what the owner ticked is as bad a bug
  as one that quietly allows what they did not.
*/

/** Which op each capability is the key to, for the exhaustive pass below. */
const OP_FOR: Record<Capability, (typeof OPS)[number][]> = {
  read: ['list', 'get'],
  create: ['create'],
  update: ['update'],
  publish: ['publish'],
  delete: ['delete'],
}

describe('capabilities', () => {
  it('lets a session do exactly what it was granted, and nothing else', () => {
    for (const granted of CAPABILITIES) {
      for (const capability of CAPABILITIES) {
        for (const op of OP_FOR[capability]) {
          expect(sessionCan([granted], op), `${granted} -> ${op}`).toBe(granted === capability)
        }
      }
    }
  })

  it('answers the owner’s example: create yes, delete no', () => {
    const granted: Capability[] = ['read', 'create']
    expect(sessionCan(granted, 'create')).toBe(true)
    expect(sessionCan(granted, 'list')).toBe(true)
    expect(sessionCan(granted, 'delete')).toBe(false)
    expect(sessionCan(granted, 'update')).toBe(false)
    expect(sessionCan(granted, 'publish')).toBe(false)
  })

  it('refuses everything when the grant is missing, empty or unreadable', () => {
    // Default-deny, and a missing grant is the default. A value that goes
    // missing must never widen what a credential may do.
    for (const op of OPS) {
      const needsCapability = capabilityFor(op) !== null
      expect(sessionCan(undefined, op), op).toBe(!needsCapability)
      expect(sessionCan(null, op), op).toBe(!needsCapability)
      expect(sessionCan([], op), op).toBe(!needsCapability)
    }
  })

  it('always lets a session say who it is and close itself', () => {
    // A session you cannot close is a credential you cannot put down.
    expect(capabilityFor('whoami')).toBeNull()
    expect(capabilityFor('close')).toBeNull()
    expect(sessionCan([], 'close')).toBe(true)
    expect(sessionCan([], 'whoami')).toBe(true)
  })

  it('grants the intersection of what was asked for and what was ticked', () => {
    expect(grantedCapabilities(['read', 'create', 'delete'], ['read', 'create'])).toEqual([
      'read',
      'create',
    ])
    // Ticking a box the terminal did not ask for does not widen the session.
    expect(grantedCapabilities(['read'], ['read', 'delete'])).toEqual(['read'])
    // Nor does asking for everything when one box is ticked.
    expect(grantedCapabilities([...CAPABILITIES], ['update'])).toEqual(['update'])
    expect(grantedCapabilities(['create'], ['delete'])).toEqual([])
  })

  it('reads a list off the wire, keeping the known and naming the unknown', () => {
    expect(parseCapabilities(['create', 'read'])).toEqual({
      capabilities: ['read', 'create'],
      unknown: [],
    })
    expect(parseCapabilities('read, publish')).toEqual({
      capabilities: ['read', 'publish'],
      unknown: [],
    })
    // A typo is reported, not silently dropped: a grant narrower than either
    // side intended, with nothing saying so, is the failure this rule exists
    // for.
    expect(parseCapabilities(['creat', 'delete'])).toEqual({
      capabilities: ['delete'],
      unknown: ['creat'],
    })
    expect(parseCapabilities(undefined)).toEqual({ capabilities: [], unknown: [] })
    expect(parseCapabilities(['DELETE'])).toEqual({ capabilities: ['delete'], unknown: [] })
  })

  it('orders and deduplicates, so two spellings of one grant compare equal', () => {
    expect(orderCapabilities(['delete', 'read', 'read'])).toEqual(['read', 'delete'])
  })

  it('recognises its own values and nothing else', () => {
    expect(isCapability('publish')).toBe(true)
    expect(isCapability('everything')).toBe(false)
    expect(isCapability(undefined)).toBe(false)
    expect(isOp('delete')).toBe(true)
    expect(isOp('drop')).toBe(false)
    expect(isOp(null)).toBe(false)
  })

  it('names a grant in a sentence, and says what is held as well as missing', () => {
    expect(describeCapabilities(['read', 'create', 'update'])).toBe('read, create and update')
    expect(describeCapabilities([])).toBe('nothing')
    const refusal = capabilityRefusal(['read', 'update'], 'delete')
    expect(refusal).toMatch(/not approved to delete/)
    expect(refusal).toMatch(/read and update/)
  })
})

describe('presets', () => {
  it('are a shorthand for a set of capabilities and nothing more', () => {
    expect(capabilitiesForScope('read')).toEqual(['read'])
    expect(capabilitiesForScope('write')).toEqual(['read', 'create', 'update', 'publish'])
    expect(capabilitiesForScope('full')).toEqual([...CAPABILITIES])
  })

  it('keep deletion out of write, which is the distinction they exist for', () => {
    expect(capabilitiesForScope('write')).not.toContain('delete')
    expect(sessionCan(capabilitiesForScope('write'), 'delete')).toBe(false)
    expect(sessionCan(capabilitiesForScope('full'), 'delete')).toBe(true)
  })

  it('name a grant back, or call it custom', () => {
    expect(presetName(['read'])).toBe('read')
    expect(presetName(capabilitiesForScope('full'))).toBe('full')
    expect(presetName(['read', 'create'])).toBe('custom')
    expect(presetName([])).toBe('custom')
  })

  it('recognises its own values and nothing else', () => {
    expect(isScope('write')).toBe(true)
    expect(isScope('admin')).toBe(false)
    expect(isScope(undefined)).toBe(false)
    for (const scope of SCOPES) expect(capabilitiesForScope(scope).length).toBeGreaterThan(0)
  })
})

describe('the collections a session may never touch', () => {
  it('holds exactly the five that would let a session widen or outlive itself', () => {
    expect([...DENIED_COLLECTIONS].sort()).toEqual([
      'players',
      'remote-devices',
      'remote-log',
      'remote-sessions',
      'users',
    ])
  })

  it('refuses them however the allow-list is set', () => {
    for (const denied of DENIED_COLLECTIONS) {
      expect(collectionAllowed(denied, []), denied).toBe(false)
      expect(collectionAllowed(denied, [denied]), denied).toBe(false)
      expect(collectionAllowed(denied, ['guides', denied]), denied).toBe(false)
    }
  })

  it('says a denied collection is permanent and an unlisted one is a setting', () => {
    expect(collectionRefusal('users', [])).toMatch(/can never be written/)
    expect(collectionRefusal('quests', ['guides'])).toMatch(/allow-list/)
    // Two refusals that read identically are two refusals somebody will
    // misdiagnose, and the difference is the whole of what to do next.
    expect(collectionRefusal('users', [])).not.toBe(collectionRefusal('quests', ['guides']))
  })
})

describe('the allow-list', () => {
  it('treats empty as "everything not denied", the same shape as an editor with no games', () => {
    expect(collectionAllowed('guides', [])).toBe(true)
    expect(collectionAllowed('guides', null)).toBe(true)
    expect(collectionAllowed('guides', undefined)).toBe(true)
  })

  it('treats a list as an allow-list', () => {
    expect(collectionAllowed('guides', ['guides', 'quests'])).toBe(true)
    expect(collectionAllowed('items', ['guides', 'quests'])).toBe(false)
  })

  it('refuses a missing collection name rather than allowing it', () => {
    expect(collectionAllowed('', [])).toBe(false)
    expect(collectionRefusal('', [])).toMatch(/No collection/)
  })
})

describe('lifetimes', () => {
  it('fall back to the default rather than to zero', () => {
    // "Unknown is not zero." A blank field that meant a zero-minute session
    // would render the feature broken with nothing saying why.
    expect(sessionLifetimeMs(null)).toBe(DEFAULT_SESSION_MS)
    expect(sessionLifetimeMs(undefined)).toBe(DEFAULT_SESSION_MS)
    expect(sessionLifetimeMs(0)).toBe(DEFAULT_SESSION_MS)
    expect(sessionLifetimeMs(-30)).toBe(DEFAULT_SESSION_MS)
    expect(sessionLifetimeMs(Number.NaN)).toBe(DEFAULT_SESSION_MS)
    expect(idleTimeoutMs(null)).toBe(DEFAULT_IDLE_MS)
  })

  it('honour a number the owner typed', () => {
    expect(sessionLifetimeMs(90)).toBe(90 * MINUTE)
    expect(idleTimeoutMs(5)).toBe(5 * MINUTE)
  })

  it('cannot be raised past the ceiling from the admin', () => {
    expect(sessionLifetimeMs(100_000)).toBe(MAX_SESSION_MS)
  })
})

describe('the two switches', () => {
  const longEnough = 'x'.repeat(MIN_SECRET_LENGTH)

  it('reads the secret only when it is long enough to have been generated', () => {
    expect(remoteSecret({ REMOTE_CONTROL_SECRET: longEnough })).toBe(longEnough)
    expect(remoteSecret({ REMOTE_CONTROL_SECRET: 'short' })).toBeNull()
    expect(remoteSecret({ REMOTE_CONTROL_SECRET: '   ' })).toBeNull()
    expect(remoteSecret({})).toBeNull()
  })

  it('is a 404 with no secret, whatever the admin box says', () => {
    for (const settings of [null, { enabled: false }, { enabled: true }]) {
      const check = remoteAvailable(settings, {})
      expect(check.ok).toBe(false)
      if (check.ok === false) expect(check.status).toBe(404)
    }
  })

  it('is a 403 with a secret but the box unticked', () => {
    const check = remoteAvailable({ enabled: false }, { REMOTE_CONTROL_SECRET: longEnough })
    expect(check.ok).toBe(false)
    if (check.ok === false) {
      expect(check.status).toBe(403)
      expect(check.message).toMatch(/Remote control/)
    }
  })

  it('opens only when both are set', () => {
    expect(remoteAvailable({ enabled: true }, { REMOTE_CONTROL_SECRET: longEnough }).ok).toBe(true)
  })
})
