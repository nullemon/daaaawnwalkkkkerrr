import { describe, expect, it } from 'vitest'
import {
  ACCENT,
  BOXES,
  GRID,
  MARGIN,
  RULES,
  SHEET,
  badgeSvg,
  glyphBox,
  glyphSvg,
  markPath,
} from './brand'

/**
 * These pin the two things about the mark that fail silently.
 *
 * A favicon has no failing state: a browser renders whatever it is given at
 * whatever size it wants, says nothing, and nobody sees the result at 16px
 * unless they go looking. Both regressions below happened while the artwork
 * looked correct at 512px, which is the only size a person naturally checks.
 */
describe('the four-unit grid', () => {
  it('puts every edge on a whole pixel at 16px and 32px', () => {
    /*
      The viewBox is 64 units and the mark is used at 16, so four units is one
      device pixel. A coordinate off that grid antialiases: the margin rule was
      drawn at x=18 once and came out of the raster as a pink smear, crisp at
      512 and mud at 16. Nothing errored.
    */
    const off: string[] = []
    for (const [index, box] of BOXES.entries()) {
      for (const [key, value] of Object.entries(box)) {
        if (value % GRID !== 0) off.push(`box ${index} ${key}=${value}`)
      }
    }
    expect(off).toEqual([])
  })
})

describe('the mark', () => {
  it('cuts the margin and every line out of one leaf', () => {
    // One `M` per subpath: the leaf, the margin, and three lines. If this
    // grows, something is being drawn on top rather than cut out — and only a
    // cut-out survives being filled with a single `currentColor`.
    expect(markPath().match(/M/g)).toHaveLength(2 + RULES.length)
  })

  it('ends the writing on a short line', () => {
    /*
      The detail that makes three bands read as writing rather than as a
      striped box. Equal lengths is the regression, and it is invisible at any
      size larger than a favicon.
    */
    const last = RULES[RULES.length - 1]
    for (const rule of RULES.slice(0, -1)) expect(last.w).toBeLessThan(rule.w)
  })

  it('keeps a pixel of daylight between the margin and the writing', () => {
    // Butted together they fuse into a bold capital E at 17px, which is what
    // the first version of the glyph actually looked like in the footer.
    const gap = Math.min(...RULES.map((rule) => rule.x)) - (MARGIN.x + MARGIN.w)
    expect(gap).toBeGreaterThanOrEqual(GRID)
  })

  it('keeps everything inside the leaf', () => {
    for (const box of [MARGIN, ...RULES]) {
      expect(box.x).toBeGreaterThan(SHEET.x)
      expect(box.y).toBeGreaterThan(SHEET.y + SHEET.corner)
      expect(box.x + box.w).toBeLessThan(SHEET.x + SHEET.w)
      expect(box.y + box.h).toBeLessThan(SHEET.y + SHEET.h)
    }
  })
})

describe('badgeSvg', () => {
  it('inks the margin in whatever accent it is handed', () => {
    // `appearanceAccent` on Site settings is network-wide, so the brand colour
    // has one source. A hard-coded red in the generator would be a second.
    expect(badgeSvg({ accent: '#00ff00' })).toContain('#00ff00')
    expect(badgeSvg()).toContain(ACCENT)
  })

  it('rasterises at the size asked for rather than at the design size', () => {
    // Left at 64 the renderer draws 64 pixels and the caller upscales a
    // bitmap, so the 512 icon comes out soft while the SVG behind it is exact.
    expect(badgeSvg({ size: 512 })).toContain('width="512"')
    expect(badgeSvg({ size: 512 })).toContain(`viewBox="0 0 ${64} ${64}"`)
  })

  it('can drop the plate radius for the platform that adds its own', () => {
    // iOS masks the touch icon. A plate already rounded leaves transparent
    // corners for iOS to fill with a colour nobody chose.
    expect(badgeSvg({ radius: 0 })).toContain('rx="0"')
  })

  it('declares no ids', () => {
    /*
      A mask or a clip would need one, and `Logo.tsx` renders the same artwork
      twice into one page — the rail and the footer. Duplicate ids are invalid
      and resolve differently between browsers, so the mark is an evenodd path
      with nothing to collide.
    */
    expect(badgeSvg()).not.toMatch(/\bid=/)
    expect(glyphSvg()).not.toMatch(/\bid=/)
  })
})

describe('glyphSvg', () => {
  it('crops to the leaf so the glyph fills its slot', () => {
    // The badge needs plate around the leaf; a 21px rail icon does not, and
    // the full 64-unit box renders the mark at 62% of its neighbours.
    const [x, y, w, h] = glyphBox().split(' ').map(Number)
    expect(x).toBeLessThan(SHEET.x)
    expect(y).toBeLessThan(SHEET.y)
    expect(w).toBeLessThan(64)
    expect(h).toBeLessThan(64)
  })

  it('paints in currentColor so it works in both themes', () => {
    expect(glyphSvg()).toContain('currentColor')
    expect(glyphSvg()).not.toContain('#')
  })
})
