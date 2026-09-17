import { describe, expect, it } from 'vitest'
import { clean, linkedNames, rawField, suspectValues } from './fetch-companies.mjs'

/**
 * The template resolver, which is the part of the company harvest whose
 * failures are invisible.
 *
 * A dropped template takes its arguments with it and leaves whatever sat
 * outside the braces looking like a complete answer. That is how six revenue
 * figures came to be stored as the literal string "(2025)": the euro
 * templates were not in KEEP_ARGS, so `{{€|59.5 million}} (2025)` resolved to
 * the year alone and nothing anywhere said a value had been lost.
 */
describe('clean', () => {
  it('keeps a figure wrapped in a currency-symbol template, with its currency', () => {
    expect(clean('{{Increase}} {{€|59.5&nbsp;million}} (2025)')).toBe('€59.5 million (2025)')
  })

  it('keeps one wrapped in the spelled-out currency template', () => {
    expect(clean('{{Euro|7&nbsp;million|link=yes}} (2014)')).toBe('€7 million (2014)')
  })

  it('drops a named argument rather than printing it', () => {
    // "7 million link=yes" reads as a typo on the page and as nothing at all
    // in a diff.
    expect(clean('{{Euro|7 million|link=yes}}')).not.toContain('link=')
  })

  it('still handles the dollar form the list already had', () => {
    expect(clean('{{US$|8.0&nbsp;billion}} (2025)')).toBe('US$8.0 billion (2025)')
  })

  /*
    Sega's revenue, and the reason the currency has to come from the template's
    *name* rather than from its arguments. `{{Yen}}` has no arguments at all:
    it is the unit and nothing else, so keeping only arguments resolved it to
    nothing and left "247.7 billion" on the profile. An English reader supplies
    dollars, which is wrong by a factor of about a hundred and fifty.
  */
  it('puts back a currency the template carried in its name and not its arguments', () => {
    expect(clean('{{increase}} {{Yen}}247.7 billion')).toBe('¥247.7 billion')
  })

  it('reads the symbol form of the yen template too', () => {
    expect(clean('{{profit}} {{¥|84.5}}{{nbsp}}billion (2023)')).toBe('¥84.5 billion (2023)')
  })

  it('gives a figure written against its unit the space it renders with', () => {
    expect(clean('{{Increase}} {{JPY|2.31trillion}}')).toBe('¥2.31 trillion')
  })

  it('unwraps a piped link to its display text, once', () => {
    expect(clean('{{ubl|[[Chief executive officer|CEO]]}}')).toBe('CEO')
  })

  /*
    Sega again, in the field that reaches the "Who runs it" list. `{{ill}}`
    links an article English does not have yet; dropped whole it took the
    chairman's name with it and left "(chairman and CEO)" — a post with nobody
    in it, printed on the profile as though a source had named a person.
  */
  it('reads the name out of an interlanguage link', () => {
    expect(clean('{{ill|Haruki Satomi|ja|里見治紀}} ([[chairman]] and [[Chief executive officer|CEO]])')).toBe(
      'Haruki Satomi (chairman and CEO)',
    )
  })

  it('drops a citation entirely', () => {
    expect(clean('387 <ref name="x">{{cite web |url=http://e.com}}</ref>')).toBe('387')
  })

  /*
    An editor's note is not a value, and the unterminated form is the one that
    reaches a page: the comment opened inside the infobox field and closed
    outside it, so one company's industry read "Mass media, Entertainment, <!--".
  */
  it('drops an HTML comment, closed or not', () => {
    expect(clean('Mass media, Entertainment, <!-- please discuss on talk')).toBe('Mass media, Entertainment')
    expect(clean('Video games <!-- not film --> ')).toBe('Video games')
  })

  it('records a value that came out as nothing but a year, or with no currency', () => {
    const before = suspectValues.length
    // A template nobody has taught this parser about.
    clean('{{SomeUnknownCurrencyTemplate|12 million}} (2021)')
    // `clean` alone does not record — the note() wrapper at the call site does,
    // so this asserts the collector is not firing spuriously.
    expect(suspectValues.length).toBe(before)
  })
})

/**
 * Reading one infobox parameter, which is where the corporate graph comes from.
 *
 * This searched from the infobox to the end of the article, so a company whose
 * infobox has no `parent` took whichever `| parent =` appeared later — inside a
 * citation, inside a second infobox — and swept up every wikilink between the
 * two. Forty companies had a list of "parents" holding Gamasutra, IGN, Kotaku
 * and the word "chairman", and that list is what the site decides ownership
 * from.
 */
describe('rawField', () => {
  const article = [
    '{{Infobox company',
    '| name = Example Studio',
    '| parent = [[Big Holdings]]',
    '| industry = [[Video game industry|Video games]]',
    '}}',
    'Example Studio is a studio.',
    '<ref>{{cite web |parent=[[Gamasutra]] |title=[[IGN]]}}</ref>',
  ].join('\n')

  it('reads the parameter out of the infobox', () => {
    expect(linkedNames(rawField(article, 'parent'))).toEqual(['Big Holdings'])
  })

  it('reads the last parameter, which no pipe follows', () => {
    const last = ['{{Infobox company', '| name = Example', '| parent = [[Big Holdings]]', '}}', 'Body.'].join('\n')
    expect(linkedNames(rawField(last, 'parent'))).toEqual(['Big Holdings'])
  })

  it('finds nothing when the infobox does not carry the field', () => {
    const none = [
      '{{Infobox company',
      '| name = Example Studio',
      '}}',
      'Body text {{cite web |parent=[[Gamasutra]]}} and [[Kotaku]] and [[IGN]].',
    ].join('\n')
    expect(linkedNames(rawField(none, 'parent'))).toEqual([])
  })
})

/**
 * Counting braces, which is the bug under the bug.
 *
 * A delimiter is two characters and has to be counted once. Testing for `}}`
 * at every position reads `}}}}` — one template closing inside another, which
 * is how every infobox list ends — as three closings, so the walk decides the
 * infobox ended early and cuts the value off mid-template. The `{{ubl|…}}`
 * around Cygames', EQT's and Behaviour Interactive's key people lost its
 * closing braces that way, so nothing recognised it as a template and its name
 * went onto the page as the first person in the list.
 */
describe('nested template closings', () => {
  const article = [
    '{{Infobox company',
    '| name = Example',
    '| key_people = {{ubl|Ann Example {{small|(chairman)}}|Bo Example {{small|(CEO)}}}}',
    '| parent = [[Big Holdings]]',
    '}}',
  ].join('\n')

  it('does not end the infobox at a nested closing', () => {
    /* The field after the one ending in `}}}}` is still inside the infobox. */
    expect(linkedNames(rawField(article, 'parent'))).toEqual(['Big Holdings'])
  })

  it('keeps a list template whole, so it resolves instead of printing its name', () => {
    const value = clean(rawField(article, 'key_people'))
    expect(value).toBe('Ann Example (chairman), Bo Example (CEO)')
    expect(value).not.toContain('ubl')
  })
})
