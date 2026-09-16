import { describe, expect, it } from 'vitest'
import { hostFor, hostLabelProblem, normaliseLabel } from './host-label'

const ok = (value: string) => expect(hostLabelProblem(value)).toBeNull()
const bad = (value: string) => expect(hostLabelProblem(value)).toBeTruthy()

describe('labels a wiki can actually be served on', () => {
  it('accepts the slugs already in use', () => {
    for (const slug of [
      'dawnwalker',
      'gears-of-war-e-day',
      'onimusha-way-of-the-sword',
      'star-wars-zero-company',
      'resonance-a-plague-tale-legacy',
      'phantom-blade-zero',
      'silent-hill-townfall',
      'control-resonant',
      'companies',
    ]) {
      expect(hostLabelProblem(slug), slug).toBeNull()
    }
  })

  it('accepts a single word and a digit in the middle', () => {
    ok('capcom')
    ok('half-life-2-wiki')
  })
})

describe('labels DNS will not serve', () => {
  it('rejects an empty label', () => {
    bad('')
    bad('   ')
  })

  it('rejects characters that are not letters, digits or hyphens', () => {
    bad('my_wiki')
    bad('my wiki')
    bad('wiki!')
    bad('wiki.sub')
    bad('café')
  })

  it('names the offending characters, because the rule is not guessable', () => {
    expect(hostLabelProblem('my_wiki')).toContain('_')
  })

  it('rejects a leading or trailing hyphen', () => {
    bad('-wiki')
    bad('wiki-')
  })

  it('rejects a label over the 63-character limit', () => {
    ok('a'.repeat(63))
    bad('a'.repeat(64))
  })

  it('rejects an all-digit label, which reads as an address', () => {
    bad('2024')
  })
})

describe('normalising', () => {
  it('lower-cases and trims, because hostnames do not care about either', () => {
    expect(normaliseLabel('  Dawnwalker  ')).toBe('dawnwalker')
  })

  it('accepts a capitalised label rather than being pedantic about it', () => {
    ok('Dawnwalker')
  })

  it('builds the host an editor will actually visit', () => {
    expect(hostFor('dawnwalker', 'example.com')).toBe('dawnwalker.example.com')
    expect(hostFor('Dawnwalker', 'https://example.com/')).toBe('dawnwalker.example.com')
  })
})
