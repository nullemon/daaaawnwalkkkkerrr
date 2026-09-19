import { describe, expect, it } from 'vitest'
import { rightsholderNames, rightsholdersIn } from './rightsholders'

describe('rightsholderNames', () => {
  it('leaves a single company alone', () => {
    expect(rightsholderNames('Capcom')).toEqual(['Capcom'])
    expect(rightsholderNames('Bandai Namco Entertainment')).toEqual(['Bandai Namco Entertainment'])
  })

  /*
    The defect. `/about` on the Silent Hill wiki linked
    `companies.<domain>/konami-annapurna-interactive`, which 404s, while
    `GameProfile` on the same wiki split the same string and linked both
    companies correctly.
  */
  it('splits two companies written into one field', () => {
    expect(rightsholderNames('Konami, Annapurna Interactive')).toEqual([
      'Konami',
      'Annapurna Interactive',
    ])
  })

  /*
    And the Antar 4 half: the rule that fixes the line above must not break
    this one. `Atari, Inc.` is a real profile on this network's companies host.
  */
  it('keeps a legal suffix attached to the name it belongs to', () => {
    expect(rightsholderNames('Atari, Inc.')).toEqual(['Atari, Inc.'])
    expect(rightsholderNames('Take-Two Interactive Software, Inc.')).toEqual([
      'Take-Two Interactive Software, Inc.',
    ])
    expect(rightsholderNames('Koei Tecmo Games Co., Ltd.')).toEqual(['Koei Tecmo Games Co., Ltd.'])
  })

  it('handles both at once', () => {
    expect(rightsholderNames('Atari, Inc., Annapurna Interactive')).toEqual([
      'Atari, Inc.',
      'Annapurna Interactive',
    ])
  })

  it('splits on an ampersand and on a standalone "and"', () => {
    expect(rightsholderNames('Sega & Atlus')).toEqual(['Sega', 'Atlus'])
    expect(rightsholderNames('Konami and Annapurna Interactive')).toEqual([
      'Konami',
      'Annapurna Interactive',
    ])
  })

  it('does not split a name that merely contains the letters "and"', () => {
    expect(rightsholderNames('Bandai Namco Entertainment')).toEqual(['Bandai Namco Entertainment'])
    expect(rightsholderNames('Sandlot')).toEqual(['Sandlot'])
  })

  it('is empty for an empty field', () => {
    expect(rightsholderNames('')).toEqual([])
    expect(rightsholderNames(null)).toEqual([])
    expect(rightsholderNames(undefined)).toEqual([])
  })
})

describe('rightsholdersIn', () => {
  it('reads both fields and deduplicates a studio that publishes itself', () => {
    // Remedy develops and publishes Control Resonant; it is one profile.
    expect(rightsholdersIn('Remedy Entertainment', 'Remedy Entertainment')).toEqual([
      { name: 'Remedy Entertainment', slug: 'remedy-entertainment' },
    ])
  })

  it('keeps the order the fields were written in', () => {
    expect(rightsholdersIn('Screen Burn', 'Konami, Annapurna Interactive')).toEqual([
      { name: 'Screen Burn', slug: 'screen-burn' },
      { name: 'Konami', slug: 'konami' },
      { name: 'Annapurna Interactive', slug: 'annapurna-interactive' },
    ])
  })

  it('slugifies a name with a suffix into one slug', () => {
    expect(rightsholdersIn('Atari, Inc.')).toEqual([{ name: 'Atari, Inc.', slug: 'atari-inc' }])
  })
})
