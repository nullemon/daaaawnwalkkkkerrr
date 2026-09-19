import { describe, expect, it } from 'vitest'
import type { Finding } from '../audit'
import { gateRefusal, remoteBlockers } from './gate'

const finding = (partial: Partial<Finding>): Finding => ({
  level: 'note',
  actor: 'info',
  area: 'network',
  detail: 'something',
  count: 1,
  ...partial,
})

describe('what closes the gate', () => {
  it('is a finding that is both blocking and the owner’s', () => {
    const blockers = remoteBlockers([
      finding({
        level: 'blocking',
        actor: 'owner',
        area: 'network',
        detail: 'NEXT_PUBLIC_SITE_URL is unset',
      }),
    ])
    expect(blockers).toEqual([{ area: 'network', detail: 'NEXT_PUBLIC_SITE_URL is unset' }])
  })

  it('opens when there is nothing outstanding', () => {
    expect(remoteBlockers([])).toEqual([])
  })
})

describe('what deliberately does not close it', () => {
  it('ignores editorial work, however blocking', () => {
    /*
      Fixing an editorial gap is the commonest thing this tool is for. Locking
      the tool behind the work the tool exists to do is a circle.
    */
    expect(
      remoteBlockers([
        finding({ level: 'blocking', actor: 'editorial', detail: 'a missing credit line' }),
      ]),
    ).toEqual([])
  })

  it('ignores gaps nobody can close', () => {
    // CLAUDE.md: a `blocked` finding is never presented as an action, and a
    // gate is an action. 78 quests with no published segment cost is the state
    // of the world.
    expect(
      remoteBlockers([
        finding({ level: 'blocking', actor: 'blocked', detail: 'no published segment cost' }),
      ]),
    ).toEqual([])
  })

  it('ignores answers', () => {
    expect(
      remoteBlockers([finding({ level: 'note', actor: 'info', detail: 'serves on companies.x' })]),
    ).toEqual([])
  })

  it('ignores a warning the owner could act on but nobody called blocking', () => {
    expect(
      remoteBlockers([finding({ level: 'warn', actor: 'owner', detail: 'still called Vellum' })]),
    ).toEqual([])
  })
})

describe('the refusal the terminal prints', () => {
  it('names every blocker rather than saying the site is not ready', () => {
    const text = gateRefusal([
      { area: 'network', detail: 'NEXT_PUBLIC_SITE_URL is unset' },
      { area: 'dawnwalker', detail: 'host label will not resolve' },
    ])
    expect(text).toMatch(/2 launch checks are outstanding/)
    expect(text).toMatch(/NEXT_PUBLIC_SITE_URL is unset/)
    expect(text).toMatch(/host label will not resolve/)
    expect(text).toMatch(/check:launch/)
  })

  it('reads as one check when there is one', () => {
    expect(gateRefusal([{ area: 'network', detail: 'one thing' }])).toMatch(
      /1 launch check is outstanding/,
    )
  })
})
