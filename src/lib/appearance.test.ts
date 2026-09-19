import { describe, expect, it } from 'vitest'
import {
  accentRefusal,
  accentStyles,
  checkAccent,
  contrast,
  isDefaultTheme,
  isHexColour,
  isThemeLock,
  lockedTheme,
  THEME_STORAGE_KEY,
  themeBootScript,
  type ThemeLock,
} from './appearance'

/**
 * Executes the boot script the way a browser would and reports what it put on
 * `<html>`, or undefined when it set nothing.
 *
 * Shared by the locked and unlocked cases so both are measured by the same
 * instrument: reading the emitted string is a test of the string, and the
 * thing that has to be true is what the script *does*.
 */
const run = (
  stored: string | null,
  fallback: 'dark' | 'light' | 'system',
  lock: ThemeLock | null | undefined = 'free',
): string | undefined => {
  const attributes = new Map<string, string>()
  const documentElement = {
    setAttribute: (name: string, value: string) => attributes.set(name, value),
  }
  const fn = new Function('document', 'localStorage', themeBootScript(fallback, lock)) as (
    d: unknown,
    s: unknown,
  ) => void
  fn({ documentElement }, { getItem: () => stored })
  return attributes.get('data-theme')
}

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

  /*
    The check is not relaxed under a theme lock, and this is the pin.

    The argument for relaxing it is real — a dark-locked site never shows the
    light ground — and it is still the wrong call, because the accent is stored
    once and re-read forever while the lock is one select box away from being
    lifted. An accent accepted against the dark ground alone becomes illegal
    the day somebody unlocks the site, and nothing would re-check it: the
    refusal lives in a field validator, which only runs when that field is
    saved. It is also not purely a theme token — `brand.ts` paints it on PLATE
    for the favicon and the share card in either theme.

    See the docstring on `checkAccent` for the third reason.
  */
  it('measures both grounds whatever the site is locked to', () => {
    // Arity, not behaviour: there is no lock to pass, and adding one is the
    // change this test exists to route through the docstring above.
    expect(checkAccent).toHaveLength(1)
    expect(accentRefusal).toHaveLength(1)
    expect(checkAccent('#d13a44').map((c) => c.label)).toEqual([
      'on the dark page',
      'on the light page',
      'white button text on it',
    ])
    // The one that only matters on a ground a dark-locked site never shows.
    expect(accentRefusal('#f2f4f8')).toContain('on the light page')
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
    expect(run('light', 'dark')).toBe('light')
    expect(run(null, 'dark')).toBe('dark')
    expect(run(null, 'light')).toBe('light')
    expect(run(null, 'system')).toBeUndefined()
    // Junk in storage is not a theme, so the network default decides.
    expect(run('sepia', 'dark')).toBe('dark')
  })
})

/*
  The boot script under a theme lock.

  Every one of these is "a reader chose X months ago and the owner has since
  decided otherwise". The failure this guards is not a crash — it is one reader
  seeing a light page on a site that is dark everywhere else, with nothing
  anywhere saying why, which is the shape of bug this repo keeps finding.
*/
describe('themeBootScript under a lock', () => {
  it('ignores a stored light on a dark-locked site', () => {
    expect(run('light', 'light', 'dark')).toBe('dark')
    expect(run('light', 'system', 'dark')).toBe('dark')
  })

  it('ignores a stored dark on a light-locked site', () => {
    expect(run('dark', 'dark', 'light')).toBe('light')
    expect(run('dark', 'system', 'light')).toBe('light')
  })

  it('stamps the attribute whatever else is true', () => {
    // Always present is what makes the lock work with no CSS change: every
    // prefers-colour-scheme block in globals.css guards itself with
    // `:not([data-theme=…])`, so an attribute that is always there is an
    // attribute the system preference can never beat. `color-scheme` rides
    // along, because it is declared inside those same palette blocks.
    for (const stored of [null, 'dark', 'light', 'sepia']) {
      for (const fallback of ['dark', 'light', 'system'] as const) {
        expect(run(stored, fallback, 'dark')).toBe('dark')
        expect(run(stored, fallback, 'light')).toBe('light')
      }
    }
  })

  it('never reads storage at all when locked', () => {
    // Not "reads it and overrules it". A lock is a site-wide decision, not a
    // reason to touch somebody's stored preference — lift the lock and their
    // choice comes back, so nothing here clears it either.
    const script = themeBootScript('dark', 'light')
    expect(script).not.toContain('localStorage')
    expect(script).not.toContain(THEME_STORAGE_KEY)
  })

  it('still reads storage when readers may switch', () => {
    for (const lock of ['free', null, undefined] as const) {
      expect(themeBootScript('dark', lock)).toContain('localStorage')
    }
    // Both directions: unlocked honours storage, then the default, then nothing.
    expect(run('light', 'dark', 'free')).toBe('light')
    expect(run(null, 'light', 'free')).toBe('light')
    expect(run(null, 'system', 'free')).toBeUndefined()
  })

  it('treats a null or unknown lock as "readers may switch"', () => {
    /*
      The column is nullable and every settings row written before the field
      existed reads back null. A null read as "locked" — which is what any
      `!== 'free'` comparison gives — would pin the whole network to a theme
      nobody chose, on the first boot after a deploy, with no change in the
      admin to explain it.
    */
    for (const lock of [null, undefined, '', 'sepia', 'system', 0, true] as unknown[]) {
      expect(run('light', 'dark', lock as never)).toBe('light')
    }
  })
})

describe('isThemeLock and lockedTheme', () => {
  it('takes the three and nothing else', () => {
    expect(['free', 'dark', 'light'].every(isThemeLock)).toBe(true)
    for (const value of ['system', 'none', '', null, undefined, 0]) {
      expect(isThemeLock(value)).toBe(false)
    }
  })

  it('answers with a theme only for the two that are one', () => {
    expect(lockedTheme('dark')).toBe('dark')
    expect(lockedTheme('light')).toBe('light')
    // 'free' is not a theme, and neither is anything that is not a lock.
    for (const value of ['free', 'system', null, undefined, '', 42]) {
      expect(lockedTheme(value)).toBeNull()
    }
  })
})

describe('isDefaultTheme', () => {
  it('takes the three and nothing else', () => {
    expect(['dark', 'light', 'system'].every(isDefaultTheme)).toBe(true)
    for (const value of ['auto', '', null, undefined, 0]) expect(isDefaultTheme(value)).toBe(false)
  })
})
