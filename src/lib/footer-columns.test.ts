import { describe, expect, it } from 'vitest'
import { editedColumns, mergeFooterColumns, type FooterColumn } from './footer-columns'

/*
  The built-in map of a wiki host, shortened. `This site` is the column that
  carries the only inbound link on that host to three pages, which is the whole
  reason this module exists.
*/
const BUILT_IN: FooterColumn[] = [
  {
    heading: 'Sections',
    links: [
      { label: 'Quests', href: '/quests' },
      { label: 'Regions', href: '/regions' },
    ],
  },
  {
    heading: 'This site',
    links: [
      { label: 'About the data', href: '/about' },
      { label: 'Report an error', href: '/corrections' },
      { label: 'Request a feature', href: '/requests' },
    ],
  },
]

describe('mergeFooterColumns', () => {
  it('changes nothing when the field is empty', () => {
    expect(mergeFooterColumns(BUILT_IN, null)).toEqual(BUILT_IN)
    expect(mergeFooterColumns(BUILT_IN, [])).toEqual(BUILT_IN)
  })

  it('keeps every built-in link when an editor fills the field in', () => {
    /*
      The defect, pinned. One filled column used to replace the whole map, so
      `/about`, `/corrections` and `/requests` lost their only inbound link on
      the host with nothing erroring and every check still green.
    */
    const shown = mergeFooterColumns(BUILT_IN, [
      { heading: 'Community', links: [{ label: 'Discord', href: 'https://example.com/d' }] },
    ])
    const hrefs = shown.flatMap((column) => column.links.map((link) => link.href))
    expect(hrefs).toContain('/about')
    expect(hrefs).toContain('/corrections')
    expect(hrefs).toContain('/requests')
    expect(hrefs).toContain('https://example.com/d')
  })

  it('adds a new heading as its own column, after the built-in ones', () => {
    const shown = mergeFooterColumns(BUILT_IN, [
      { heading: 'Community', links: [{ label: 'Discord', href: '/d' }] },
    ])
    expect(shown.map((column) => column.heading)).toEqual(['Sections', 'This site', 'Community'])
  })

  it('adds to a column whose heading already exists rather than duplicating it', () => {
    const shown = mergeFooterColumns(BUILT_IN, [
      { heading: 'This site', links: [{ label: 'Style guide', href: '/style' }] },
    ])
    expect(shown).toHaveLength(2)
    expect(shown[1].links.map((link) => link.href)).toEqual([
      '/about',
      '/corrections',
      '/requests',
      '/style',
    ])
  })

  it('matches a heading through case and surrounding space', () => {
    const shown = mergeFooterColumns(BUILT_IN, [
      { heading: '  this site ', links: [{ label: 'Style guide', href: '/style' }] },
    ])
    expect(shown).toHaveLength(2)
  })

  it('does not print the same page twice, and keeps the built-in label', () => {
    const shown = mergeFooterColumns(BUILT_IN, [
      { heading: 'This site', links: [{ label: 'Our sources', href: '/about' }] },
    ])
    expect(shown[1].links.filter((link) => link.href === '/about')).toEqual([
      { label: 'About the data', href: '/about' },
    ])
  })

  it('drops a column that would render as a heading over nothing', () => {
    // A half-filled record: the heading typed, the links not yet.
    const shown = mergeFooterColumns(BUILT_IN, [{ heading: 'Community', links: [] }])
    expect(shown.map((column) => column.heading)).toEqual(['Sections', 'This site'])
  })

  it('drops a built-in column with no links, which is a wiki with no tools', () => {
    const shown = mergeFooterColumns([...BUILT_IN, { heading: 'Tools', links: [] }], null)
    expect(shown.map((column) => column.heading)).toEqual(['Sections', 'This site'])
  })
})

describe('editedColumns', () => {
  it('drops a link with no href rather than rendering a dead anchor', () => {
    expect(
      editedColumns([
        { heading: 'Community', links: [{ label: 'Discord', href: '  ' }, { label: 'Forum', href: '/f' }] },
      ]),
    ).toEqual([{ heading: 'Community', links: [{ label: 'Forum', href: '/f' }] }])
  })

  it('falls back to the href when a link has no label', () => {
    // An empty anchor is a link nobody can click and nothing says why.
    expect(editedColumns([{ heading: 'C', links: [{ label: null, href: '/f' }] }])[0].links).toEqual(
      [{ label: '/f', href: '/f' }],
    )
  })

  it('drops a column with no heading', () => {
    expect(editedColumns([{ heading: '  ', links: [{ label: 'A', href: '/a' }] }])).toEqual([])
  })
})
