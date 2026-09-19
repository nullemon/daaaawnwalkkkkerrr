import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { PASS_THROUGH, APEX_ONLY, subdomainOf } from './proxy'
import { KEY_FILE_PATTERN } from './lib/indexnow'
import { ADMIN_SEGMENT } from './lib/admin-path'

/**
 * Everything in `public/` has to survive the rewrite.
 *
 * This check exists because the same omission has now been made three times,
 * and each time it was invisible in a different way.
 *
 * `icon.svg` and `og.png` were exempt only on the apex, so three of the four
 * icons the hub declares answered a 308 to a host that does not exist — and a
 * browser that cannot fetch a declared icon silently falls back to the next
 * one. The IndexNow key file was not exempt at all, so ownership verification
 * failed on every host. And `public/art/`, the fourteen section band
 * photographs, 404'd on every wiki host for as long as the bands have
 * existed: `sectionArt` hands the path to a CSS `background-image`, which is
 * the quietest failure on the web — no broken-image glyph, no layout shift,
 * nothing in any log. The band renders at full height with its gradient and
 * its credit line, crediting a photograph that is not there.
 *
 * Every one of them passed every check the project had, because the checks ask
 * whether the file is on disk. It always was. **Counting files is not checking
 * pages**, so this asks the routing table the question instead: for each entry
 * at the root of `public/`, is there anything that would stop a request for it
 * being rewritten onto a game prefix?
 *
 * It is a unit test rather than a `check:launch` fetch on purpose — it needs no
 * server, so it fails on the commit that adds the file rather than on the day
 * somebody looks.
 */
describe('everything served from public/ is exempt from the rewrite', () => {
  const root = path.resolve('public')
  const entries = fs.readdirSync(root)

  it('finds a public directory with files in it', () => {
    // A path that has silently become empty would make every case below pass.
    expect(entries.length).toBeGreaterThan(0)
  })

  for (const entry of entries) {
    it(`${entry} is reachable on a wiki host`, () => {
      /*
        The key file is the one exemption, and it is a shape rather than a
        name: it is regenerated whenever the owner changes the key, so pinning
        today's filename here would make this test fail on the day somebody
        rotates it. `proxy.ts` matches the same pattern and rewrites it to the
        route that serves it.
      */
      if (KEY_FILE_PATTERN.test(entry)) return
      expect(PASS_THROUGH.has(entry)).toBe(true)
    })
  }
})

describe('the two lists stay in step', () => {
  it('APEX_ONLY contains everything PASS_THROUGH does', () => {
    // APEX_ONLY spreads PASS_THROUGH in, and this pins that it still does —
    // the icon set was once listed in APEX_ONLY *instead*, which is what made
    // the favicons apex-only and left the companies and people hosts with
    // none at all.
    for (const entry of PASS_THROUGH) expect(APEX_ONLY.has(entry)).toBe(true)
  })
})

describe('subdomainOf', () => {
  it('reads a single label in front of the network domain', () => {
    expect(subdomainOf('dawnwalker.example.com', 'example.com')).toBe('dawnwalker')
  })

  it('returns null on the apex and on www', () => {
    expect(subdomainOf('example.com', 'example.com')).toBeNull()
    expect(subdomainOf('www.example.com', 'example.com')).toBeNull()
  })

  it('handles a root domain with a different number of labels', () => {
    // Matched by suffix rather than by counting dots: `example.co.uk` has
    // three labels and `dawnwalker.localhost` has one.
    expect(subdomainOf('people.example.co.uk', 'example.co.uk')).toBe('people')
    expect(subdomainOf('dawnwalker.localhost:3000', 'localhost:3000')).toBe('dawnwalker')
  })

  it('refuses anything deeper than one label, and anything not ours', () => {
    expect(subdomainOf('a.b.example.com', 'example.com')).toBeNull()
    expect(subdomainOf('example.com.attacker.test', 'example.com')).toBeNull()
  })
})

/**
 * The admin path, the route folder and the router exemption, pinned together.
 *
 * Payload mounts its admin at `routes.admin` and Next serves whatever folder
 * exists under `src/app/(payload)/`. If those two disagree the admin answers
 * 404 and nothing anywhere says why — not a type error, not a failing build,
 * not a log line. Moving it off `/admin` is exactly the change that creates
 * that mismatch, so the three facts are checked against each other here.
 *
 * The third is `PASS_THROUGH`: a path not exempt from the rewrite is sent to a
 * game prefix on a wiki host and redirected to a subdomain on the apex, which
 * is how three favicons, the IndexNow key file and fourteen section
 * photographs each went missing in turn.
 */
describe('the admin path, the folder and the exemption agree', () => {
  it('has a route folder named after the configured path', () => {
    const dir = path.resolve(__dirname, 'app', '(payload)', ADMIN_SEGMENT)
    expect(fs.existsSync(dir)).toBe(true)
    expect(fs.existsSync(path.join(dir, '[[...segments]]', 'page.tsx'))).toBe(true)
  })

  it('has exactly one admin folder, so the old one cannot still answer', () => {
    const payloadDir = path.resolve(__dirname, 'app', '(payload)')
    const folders = fs
      .readdirSync(payloadDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== 'api')
      .map((entry) => entry.name)
    expect(folders).toEqual([ADMIN_SEGMENT])
  })

  it('is exempt from the host rewrite', () => {
    expect(PASS_THROUGH.has(ADMIN_SEGMENT)).toBe(true)
  })

  it('is not the default path, which is what every scanner tries first', () => {
    // Not a security control and not claimed as one - see `lib/admin-path.ts`.
    expect(ADMIN_SEGMENT).not.toBe('admin')
  })
})
