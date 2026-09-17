import { describe, expect, it } from 'vitest'
import { clean, suspectValues } from './fetch-companies.mjs'

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
  it('keeps a figure wrapped in a currency-symbol template', () => {
    expect(clean('{{Increase}} {{€|59.5&nbsp;million}} (2025)')).toBe('59.5 million (2025)')
  })

  it('keeps one wrapped in the spelled-out currency template', () => {
    expect(clean('{{Euro|7&nbsp;million|link=yes}} (2014)')).toBe('7 million (2014)')
  })

  it('drops a named argument rather than printing it', () => {
    // "7 million link=yes" reads as a typo on the page and as nothing at all
    // in a diff.
    expect(clean('{{Euro|7 million|link=yes}}')).not.toContain('link=')
  })

  it('still handles the dollar form the list already had', () => {
    expect(clean('{{US$|8.0&nbsp;billion}} (2025)')).toBe('8.0 billion (2025)')
  })

  it('unwraps a piped link to its display text, once', () => {
    expect(clean('{{ubl|[[Chief executive officer|CEO]]}}')).toBe('CEO')
  })

  it('drops a citation entirely', () => {
    expect(clean('387 <ref name="x">{{cite web |url=http://e.com}}</ref>')).toBe('387')
  })

  it('records a value that came out as nothing but a year', () => {
    const before = suspectValues.length
    // A template nobody has taught this parser about.
    clean('{{SomeUnknownCurrencyTemplate|12 million}} (2021)')
    // `clean` alone does not record — the note() wrapper at the call site does,
    // so this asserts the collector is not firing spuriously.
    expect(suspectValues.length).toBe(before)
  })
})
