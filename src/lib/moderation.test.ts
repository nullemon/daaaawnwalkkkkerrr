import { describe, expect, it } from 'vitest'
import { screen, scoreOf } from './moderation'

/**
 * The point of these is the obfuscations.
 *
 * Any filter catches `https://example.com`. A filter is only worth having if
 * it also catches the forms spammers actually use once they have met a filter,
 * so most of what follows is those.
 */

describe('link removal', () => {
  const cases: [string, string][] = [
    ['plain url', 'check https://example.com for more'],
    ['no scheme', 'check www.example.com for more'],
    ['bare domain', 'check example.com for more'],
    ['path only', 'go to example.com/deals now'],
    ['spaced dot', 'go to example . com now'],
    ['worded dot', 'go to example dot com now'],
    ['bracketed dot', 'go to example[.]com now'],
    ['parenthesised dot', 'go to example(.)com now'],
    ['dashed dot', 'go to example -dot- com now'],
    ['zero for o', 'go to example d0t com now'],
    ['hxxp scheme', 'go to hxxp://example.com now'],
    ['markdown', 'see [this guide](https://example.com/guide) here'],
    ['bbcode', 'see [url=https://example.com]this[/url] here'],
    ['ip address', 'connect to 192.168.10.44/panel now'],
    ['uppercase', 'VISIT EXAMPLE.COM TODAY'],
  ]

  for (const [name, input] of cases) {
    it(`removes a link written as ${name}`, () => {
      const result = screen(input)
      expect(result.flags).toContain('link')
      expect(result.removed.length).toBeGreaterThan(0)
      expect(result.clean).toContain('[link removed]')
      // The whole point: nothing resembling the domain survives into the text
      // that may be published.
      expect(result.clean.toLowerCase()).not.toContain('example.com')
      expect(result.clean.toLowerCase()).not.toContain('192.168')
    })
  }

  it('removes several links and counts them all', () => {
    const result = screen('one https://a.com two https://b.net three https://c.org')
    expect(result.removed).toHaveLength(3)
  })

  it('leaves ordinary prose alone', () => {
    const text =
      'The segment cost here disagrees with what the wiki says. I counted four, not three, on two runs.'
    const result = screen(text)
    expect(result.flags).not.toContain('link')
    expect(result.clean).toBe(text)
    expect(result.score).toBe(0)
  })

  it('does not treat a sentence ending in a short word as a domain', () => {
    // "run.Co" would match a naive bare-domain pattern.
    const result = screen('I finished the run. Nothing else to add about it here.')
    expect(result.flags).not.toContain('link')
  })
})

describe('other removals', () => {
  it('removes an email address, including the obfuscated form', () => {
    for (const input of ['mail me at bob@example.com', 'mail me at bob [at] example dot com']) {
      const result = screen(input)
      expect(result.flags.some((flag) => flag === 'email' || flag === 'link')).toBe(true)
      expect(result.clean).not.toContain('example.com')
    }
  })

  it('strips HTML and flags it', () => {
    const result = screen('nice guide <script>alert(1)</script> thanks for writing it up')
    expect(result.flags).toContain('markup')
    expect(result.clean).not.toContain('<script>')
  })

  it('strips zero-width characters used to break up words', () => {
    // "casino" with zero-width spaces inside it, to dodge the vocabulary list.
    const result = screen('try our ca​si​no today for a real bonus offer')
    expect(result.flags).toContain('invisible-characters')
    expect(result.flags).toContain('spam-vocabulary')
  })
})

describe('signals that flag but do not remove', () => {
  it('flags shouting without altering the text', () => {
    const text = 'THIS GUIDE IS COMPLETELY WRONG ABOUT THE SEGMENT COSTS'
    const result = screen(text)
    expect(result.flags).toContain('shouting')
    expect(result.clean).toBe(text)
  })

  it('does not flag a short all-caps word as shouting', () => {
    expect(screen('NPC dialogue changes here').flags).not.toContain('shouting')
  })

  it('flags repeated characters', () => {
    expect(screen('this is soooooo good, thanks').flags).toContain('repetition')
  })

  it('flags a comment that is nothing but a link', () => {
    const result = screen('https://example.com')
    expect(result.flags).toContain('link')
    expect(result.flags).toContain('very-short')
  })

  it('does not call a substantial comment short', () => {
    const result = screen(
      'Worth adding that the second ending also needs the ally questline finished first.',
    )
    expect(result.flags).not.toContain('very-short')
  })
})

describe('scoring', () => {
  it('gives clean prose zero', () => {
    expect(scoreOf([])).toBe(0)
  })

  it('scores a bare link higher than a link inside real discussion', () => {
    const driveBy = screen('https://example.com')
    const discussion = screen(
      'I checked this against the patch notes at example.com and the figure matches what you have written here, so I think it is right.',
    )
    expect(driveBy.score).toBeGreaterThan(discussion.score)
  })

  /*
    Asserted as a distance from a real comment rather than against a number.
    An absolute threshold here is a number picked to match whatever the
    weights happen to add up to today, and it fails the next time one of them
    is adjusted for a good reason. What has to hold is the ordering: this
    reaches a moderator first, and by a wide margin.
  */
  it('scores the classic spam shape far above a real comment', () => {
    const spam = screen('BUY NOW!!!! casino bonus https://example.xyz free money')
    const real = screen(
      'The segment cost here disagrees with what I counted on two runs — four, not three.',
    )
    expect(spam.score).toBeGreaterThan(70)
    expect(spam.score - real.score).toBeGreaterThan(60)
  })

  it('never exceeds its bounds', () => {
    const everything = screen(
      'CASINO CRYPTO LOAN​!!!!! <b>x</b> bob@example.com https://a.com https://b.com https://c.com https://d.com https://e.com +1 555 555 5555',
    )
    expect(everything.score).toBeLessThanOrEqual(100)
    expect(everything.score).toBeGreaterThanOrEqual(0)
  })
})

describe('robustness', () => {
  it('handles an empty comment', () => {
    const result = screen('')
    expect(result.clean).toBe('')
    expect(result.removed).toHaveLength(0)
  })

  it('does not lose the surrounding sentence when redacting', () => {
    const result = screen('the fix is at https://example.com and it works')
    expect(result.clean).toContain('the fix is at')
    expect(result.clean).toContain('and it works')
  })
})

describe('repeated calls', () => {
  /*
    The patterns live at module scope and several carry the `g` flag, which
    makes `.test()` stateful: a match leaves `lastIndex` part-way along, and
    the next call starts from there. The symptom was spam being detected on
    every other comment — a filter that looks like it works, which is worse
    than one that plainly does not.
  */
  it('gives the same answer for the same input every time', () => {
    const spam = 'casino bonus, click here, guaranteed'
    const first = screen(spam)
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const again = screen(spam)
      expect(again.flags).toEqual(first.flags)
      expect(again.score).toBe(first.score)
      expect(again.clean).toBe(first.clean)
    }
  })

  it('is not affected by the comment screened before it', () => {
    const alone = screen('casino bonus offer here today')
    screen('some entirely unrelated comment about a boss fight that went badly')
    screen('https://example.com/a/very/long/path/that/advances/any/index')
    const after = screen('casino bonus offer here today')
    expect(after.flags).toEqual(alone.flags)
    expect(after.score).toBe(alone.score)
  })

  it('detects a phone number on a second, different comment', () => {
    screen('call me on +44 7700 900123 about this')
    const second = screen('or try 0161 496 0000 instead')
    expect(second.flags).toContain('phone')
  })
})
