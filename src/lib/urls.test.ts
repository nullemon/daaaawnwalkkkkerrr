import { describe, expect, it } from 'vitest'
import { externalSite } from './urls'

/*
  The failure these pin is a dead control, not a wrong fact: a value that is not
  a URL used to reach the DOM as an `href`, which makes it relative, so the
  "Official site" button on `/com2us` and the Website row on three people's
  profiles pointed at a 404 on our own host.
*/
describe('externalSite', () => {
  it('keeps an absolute http(s) URL exactly as the record holds it', () => {
    expect(externalSite('https://www.gordyhaabmusic.com/')).toBe('https://www.gordyhaabmusic.com/')
    expect(externalSite('http://yoshimasa-hosoya.info')).toBe('http://yoshimasa-hosoya.info')
  })

  it('refuses text that is not a URL at all', () => {
    // `/com2us` stored the link's label instead of its target.
    expect(externalSite('Official website')).toBeNull()
    expect(externalSite('')).toBeNull()
    expect(externalSite(null)).toBeNull()
    expect(externalSite(undefined)).toBeNull()
  })

  it('refuses a bare domain rather than guessing a scheme', () => {
    expect(externalSite('olivierderiviere.com')).toBeNull()
    // Two sites in one field. No scheme would rescue this one.
    expect(externalSite('nikolakolodziejczyk.com chordnation.pl')).toBeNull()
  })

  it('refuses a scheme a browser must not follow from a page', () => {
    expect(externalSite('javascript:alert(1)')).toBeNull()
    expect(externalSite('mailto:hello@example.com')).toBeNull()
  })
})
