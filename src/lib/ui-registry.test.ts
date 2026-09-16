import { describe, expect, it } from 'vitest'
import { LABEL_DEFAULTS, UI_DEFAULTS, fromMaps, overridesOnly, resolve } from './ui-registry'

describe('resolve', () => {
  it('prefers an override, then the registry, then the key itself', () => {
    expect(resolve('a.b', { 'a.b': 'written' }, { 'a.b': 'built-in' })).toBe('written')
    expect(resolve('a.b', {}, { 'a.b': 'built-in' })).toBe('built-in')
    // Visibly, rather than as an empty span. An unknown key is a bug in the
    // code, and a blank button says nothing about which one.
    expect(resolve('a.b', {}, {})).toBe('a.b')
  })

  it('treats a blank override as no override', () => {
    expect(resolve('a.b', { 'a.b': '   ' }, { 'a.b': 'built-in' })).toBe('built-in')
  })
})

describe('overridesOnly', () => {
  /*
    This is a payload-size guard, not a correctness one, and it earned a test
    the hour it was written. `pnpm seed:copy` writes a row for every key in the
    registry so the admin shows real sentences — and those maps are handed to
    the browser, so without this filter every page on the network carried all
    387 strings inline. It was visible immediately: a grep for Dawnwalker's
    480-segment clock found it in the source of a Gears of War regions page.
  */
  it('drops a row that still says what the registry says', () => {
    const rows = [{ key: 'a.b', text: 'same' }]
    expect(overridesOnly(rows, { 'a.b': 'same' })).toEqual({})
  })

  it('keeps a row somebody actually changed', () => {
    const rows = [{ key: 'a.b', text: 'different' }]
    expect(overridesOnly(rows, { 'a.b': 'same' })).toEqual({ 'a.b': 'different' })
  })

  it('keeps a row for a key the registry does not have', () => {
    expect(overridesOnly([{ key: 'a.b', text: 'x' }], {})).toEqual({ 'a.b': 'x' })
  })

  it('ignores empty rows and missing keys', () => {
    const rows = [{ key: '', text: 'x' }, { key: 'a.b', text: '  ' }, { key: 'c.d', text: null }]
    expect(overridesOnly(rows, {})).toEqual({})
    expect(overridesOnly(null, {})).toEqual({})
  })

  it('is empty against a database seeded straight from the registry', () => {
    const rows = Object.entries(UI_DEFAULTS).map(([key, text]) => ({ key, text }))
    expect(overridesOnly(rows, UI_DEFAULTS)).toEqual({})
  })
})

describe('the registry itself', () => {
  it('keys every string as exactly area.thing', () => {
    // One dot, always, so an interface key and a label key sort the same way
    // and a third dot never has to mean anything.
    const bad = [...Object.keys(UI_DEFAULTS), ...Object.keys(LABEL_DEFAULTS)].filter(
      (key) => !/^[a-z0-9-]+\.[a-z0-9-]+$/.test(key),
    )
    expect(bad).toEqual([])
  })

  it('has no blank default, which would render as the key', () => {
    const blank = Object.entries({ ...UI_DEFAULTS, ...LABEL_DEFAULTS })
      .filter(([, value]) => value.trim() === '')
      .map(([key]) => key)
    expect(blank).toEqual([])
  })
})

describe('fromMaps', () => {
  it('falls a label back to the stored value, tidied, rather than to its key', () => {
    // Enum values are data and a wiki can invent one at any time, so a missing
    // label here is not the bug a missing string is.
    const ui = fromMaps({ strings: {}, labels: {} })
    expect(ui.label('danger', 'late')).toBe('Late run')
    expect(ui.label('danger', 'not-a-real-value')).toBe('not a real value')
    expect(ui.label('danger', null)).toBe('')
  })
})
