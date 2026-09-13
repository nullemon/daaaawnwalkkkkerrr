import { describe, expect, it } from 'vitest'
import { isProvisional } from './legal'

describe('provisional legal details', () => {
  it('treats an unset field as provisional', () => {
    expect(isProvisional(undefined)).toBe(true)
    expect(isProvisional(null)).toBe(true)
    expect(isProvisional('')).toBe(true)
    expect(isProvisional('   ')).toBe(true)
  })

  it('catches the reserved documentation domains, which can never be a real inbox', () => {
    expect(isProvisional('hello@example.com')).toBe(true)
    expect(isProvisional('Hello@Example.COM')).toBe(true)
    expect(isProvisional('press@example.org')).toBe(true)
    expect(isProvisional('press@example.net')).toBe(true)
  })

  it('catches text that announces itself as a stand-in', () => {
    expect(isProvisional('PLACEHOLDER — the person running this site')).toBe(true)
    expect(isProvisional('placeholder')).toBe(true)
    expect(isProvisional('TBD')).toBe(true)
    expect(isProvisional(' todo ')).toBe(true)
    expect(isProvisional('n/a')).toBe(true)
    expect(isProvisional('Your name or handle')).toBe(true)
    expect(isProvisional('e.g. your company address')).toBe(true)
  })

  it('passes a detail that looks real', () => {
    expect(isProvisional('Corvin Ashe')).toBe(false)
    expect(isProvisional('hello@dawnwalkerguide.com')).toBe(false)
    expect(isProvisional('England and Wales')).toBe(false)
    expect(isProvisional('4 Marlow Court\nLeeds LS1 4AB\nUnited Kingdom')).toBe(false)
  })

  it('does not flag a real address that merely mentions an example elsewhere', () => {
    expect(isProvisional('example@dawnwalkerguide.com')).toBe(false)
  })
})
