import { describe, expect, it } from 'vitest'
import {
  accentRefusal,
  accentStyles,
  checkAccent,
  contrast,
  isDefaultTheme,
  isHexColour,
  themeBootScript,
} from './appearance'

describe('contrast', () => {
  it('measures the two ends of the scale', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 2)
    expect(contrast('#767676', '#767676')).toBeCloseTo(1, 5)
  })

  it('does not care which way round the pair is given', () => {
    expect(contrast('#d13a44', '#131211')).toBeCloseTo(contrast('#131211', '#d13a44'), 10)
  })

  it('reads three-digit hex the same as six', () => {
    expect(contrast('#fff', '#000')).toBeCloseTo(contrast('#ffffff', '#000000'), 10)
  })
})

/*
  The palette these numbers belong to.

  Every body-text token has to clear AA on all three surfaces it can sit on,
  and --muted is the one that always fails: the indigo palette this replaced
  measured 3.63 on --raised, so every secondary line on every card was below
  the line with nothing anywhere saying so. Pinning the numbers means the next
  person to reach for a prettier grey finds out here rather than in a report.
*/
describe('the shipped dark palette', () => {
  const ground = '#131211'
  const surface = '#1f1d1b'
  const raised = '#2b2926'
  const sunken = '#0c0b0a'
  const surfaces = { ground, surface, raised, sunken }

  const bodyText = { ink: '#f7f4f1', 'ink-soft': '#d2ccc5', muted: '#a49c93' }
  const meaningful = {
    'accent-hot': '#ff5b66',
    legendary: '#e3a33c',
    rare: '#479df5',
    common: '#a8a29a',
    danger: '#f4636c',
    good: '#45c581',
    caution: '#e3a33c',
  }

  for (const [name, hex] of Object.entries({ ...bodyText, ...meaningful })) {
    for (const [surfaceName, bg] of Object.entries(surfaces)) {
      it(`--${name} clears AA on --${surfaceName}`, () => {
        expect(contrast(hex, bg)).toBeGreaterThanOrEqual(4.5)
      })
    }
  }

  it('keeps the elevation steps apart', () => {
    // Flat elevation is the other way a dark palette fails: three surfaces
    // that measure the same are one surface with borders drawn on it.
    expect(contrast(surface, ground)).toBeGreaterThan(1.08)
    expect(contrast(raised, ground)).toBeGreaterThan(1.2)
    expect(contrast(ground, sunken)).toBeGreaterThan(1.03)
  })

  it('is not the indigo it replaced', () => {
    // A neutral has near-equal channels. The old --surface was #191937:
    // 0x37 - 0x19 is 30 points of blue over red, which is a colour.
    for (const hex of Object.values(surfaces)) {
      const [r, , b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
      expect(Math.abs(r - b)).toBeLessThanOrEqual(6)
    }
  })
})

describe('isHexColour', () => {
  it('takes both hex forms', () => {
    expect(isHexColour('#d13a44')).toBe(true)
    expect(isHexColour('#ABC')).toBe(true)
  })

  it('refuses anything that is not one', () => {
    for (const value of ['d13a44', '#d13a4', 'red', 'rgb(1,2,3)', '', null, 42]) {
      expect(isHexColour(value)).toBe(false)
    }
  })
})

describe('accentRefusal', () => {
  it('passes the accent that ships', () => {
    expect(accentRefusal('#d13a44')).toBeNull()
  })

  it('refuses a colour that vanishes into the dark page', () => {
    const refusal = accentRefusal('#1a1a20')
    expect(refusal).toContain('on the dark page')
    // The refusal is arguable or it is just a "no": it has to carry the number.
    expect(refusal).toMatch(/\d\.\d\d:1/)
  })

  it('refuses a colour that vanishes into the light page', () => {
    expect(accentRefusal('#f2f4f8')).toContain('on the light page')
  })

  it('refuses a colour white button text cannot sit on', () => {
    // The classic one: a bright yellow reads fine on both grounds and turns
    // every filled button into white on white.
    expect(accentRefusal('#ffd000')).toContain('white button text on it')
  })

  it('tells somebody who typed a colour name what to type instead', () => {
    expect(accentRefusal('crimson')).toContain('#d13a44')
  })

  it('reports every measurement, not only the failing one', () => {
    expect(checkAccent('#d13a44')).toHaveLength(3)
    expect(checkAccent('#d13a44').every((c) => c.passes)).toBe(true)
  })
})

describe('accentStyles', () => {
  it('emits nothing at all when there is no override', () => {
    // Blank means "use the shipped red", never "use nothing" — an empty
    // settings record has to render the site the code does.
    for (const value of [null, undefined, '', '   ']) {
      expect(accentStyles(value)).toBe('')
    }
  })

  it('emits nothing for an accent it would have refused', () => {
    // The validator is a convenience; this string reaches the document.
    expect(accentStyles('#ffd000')).toBe('')
  })

  it('outranks all three palette rules in globals.css', () => {
    const css = accentStyles('#2f6fd0')
    // Bare :root is dark, [data-theme='light'] is the explicit choice, and the
    // media block covers neither-attribute. An override that reached only the
    // first would win in dark and silently lose in light.
    expect(css).toContain(':root:root{')
    expect(css).toContain(":root:root[data-theme='light']{")
    expect(css).toContain('@media (prefers-color-scheme: light)')
    expect(css).toContain(":not([data-theme='dark']):not([data-theme='light'])")
  })

  it('carries the hover, border and wash shades with it', () => {
    // An override that moved --accent alone would leave every link and every
    // highlighted row the old red, on a site that is now some other colour.
    const css = accentStyles('#2f6fd0')
    for (const token of ['--accent:', '--accent-hot:', '--accent-dim:', '--accent-wash:']) {
      expect(css.split(token).length - 1).toBe(3)
    }
  })

  it('never lets anything but a hex through to the document', () => {
    expect(accentStyles('#d13a44;} body{display:none} :root{x:1')).toBe('')
  })
})

describe('themeBootScript', () => {
  it('sets the network default when nothing is remembered', () => {
    expect(themeBootScript('light')).toContain('"light"')
    expect(themeBootScript('dark')).toContain('"dark"')
  })

  it('sets no attribute at all for "follow the system"', () => {
    // No attribute is what makes the prefers-colour-scheme block in
    // globals.css the only thing deciding, which is what following the
    // system means. An explicit value there would defeat it.
    expect(themeBootScript('system')).toContain('""')
  })

  it('applies the default even when storage throws', () => {
    // A private window throws on the read. With the whole body inside one
    // try that throw swallowed the network default too.
    const script = themeBootScript('light')
    expect(script.indexOf('catch(e){}')).toBeLessThan(script.indexOf('"light"'))
  })

  it('runs as written', () => {
    const attributes = new Map<string, string>()
    const documentElement = {
      setAttribute: (name: string, value: string) => attributes.set(name, value),
    }
    const run = (stored: string | null, fallback: 'dark' | 'light' | 'system') => {
      attributes.clear()
      const fn = new Function(
        'document',
        'localStorage',
        themeBootScript(fallback),
      ) as (d: unknown, s: unknown) => void
      fn({ documentElement }, { getItem: () => stored })
      return attributes.get('data-theme')
    }

    expect(run('light', 'dark')).toBe('light')
    expect(run(null, 'dark')).toBe('dark')
    expect(run(null, 'light')).toBe('light')
    expect(run(null, 'system')).toBeUndefined()
    // Junk in storage is not a theme, so the network default decides.
    expect(run('sepia', 'dark')).toBe('dark')
  })
})

describe('isDefaultTheme', () => {
  it('takes the three and nothing else', () => {
    expect(['dark', 'light', 'system'].every(isDefaultTheme)).toBe(true)
    for (const value of ['auto', '', null, undefined, 0]) expect(isDefaultTheme(value)).toBe(false)
  })
})
