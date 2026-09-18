import type { Payload } from 'payload'
import { rich, type Block } from '../lexical'

/**
 * The privacy policy, the terms and the contact page, written into the fields
 * that can now change them.
 *
 * Sixteen hundred words of legal prose used to live in three `.tsx` files. An
 * editor who opened Legal pages before this ran found three tabs of empty
 * boxes and no way to know what any of them currently said — a control that is
 * present, reachable and useless. Worse, on a legal page: somebody would type
 * a paragraph into the first empty box, save, and replace the whole policy
 * with one paragraph, because a non-empty `sections` list is what tells the
 * page to stop using its built-in wording.
 *
 * So this writes today's wording in, verbatim, and **never overwrites**. It
 * runs inside `pnpm db:reset`, which people run without thinking hard about
 * it, and reverting somebody's redrafted privacy policy on a rebuild would be
 * the worst possible version of that.
 *
 * The values stay tokens. `{entity}`, `{email}`, `{address}` and
 * `{jurisdiction}` are substituted at render time and each one arrives as a
 * `LegalField`, so a detail that is still a stand-in is still marked in red
 * and still listed in the warning at the top of the page. Baking the values
 * into these sentences would produce a page that looks finished and has lost
 * its own safety check.
 */

type Node = { type?: string; text?: string; children?: Node[]; [key: string]: unknown }

const LINK = /\[([^\]]+)\]\(([^)]+)\)/g

/**
 * Turn `[words](/path)` into a Lexical link node.
 *
 * `rich()` builds paragraphs, headings and lists and nothing else, which is
 * all every other seed pass has needed. Three sentences here carry a link —
 * to the account page, to the correction form, to the terms — and a seeded
 * policy that silently dropped them would read identically and send nobody
 * anywhere. Doing it here rather than teaching `rich()` a fourth syntax keeps
 * the cost with the one caller that needs it.
 */
const linkify = (nodes: Node[], next: () => string): Node[] =>
  nodes.flatMap((node): Node[] => {
    if (Array.isArray(node.children)) return [{ ...node, children: linkify(node.children, next) }]
    if (node.type !== 'text' || !node.text?.includes('](')) return [node]

    const source = node.text
    const out: Node[] = []
    let cursor = 0

    for (const match of source.matchAll(LINK)) {
      const at = match.index ?? 0
      if (at > cursor) out.push({ ...node, text: source.slice(cursor, at) })
      out.push({
        type: 'link',
        fields: { linkType: 'custom', newTab: false, url: match[2] },
        children: [{ ...node, text: match[1] }],
        direction: 'ltr',
        format: '',
        indent: 0,
        version: 3,
        id: next(),
      })
      cursor = at + match[0].length
    }

    if (cursor < source.length) out.push({ ...node, text: source.slice(cursor) })
    return out
  })

const body = (...blocks: Block[]) => {
  let counter = 0
  const next = () => `seeded-link-${(counter += 1)}`
  const doc = rich(...blocks)
  return { ...doc, root: { ...doc.root, children: linkify(doc.root.children as Node[], next) } }
}

const section = (heading: string, ...blocks: Block[]) => ({ heading, body: body(...blocks) })

type PageCopy = {
  title: string
  metaDescription: string
  lede: string
  sections: { heading: string; body: unknown }[]
}

/**
 * Verbatim from the three pages. A word changed here without changing the
 * `.tsx` fallback gives a site whose policy depends on whether the seed has
 * run, which is the one thing a legal page cannot be.
 */
const PAGES: Record<'privacy' | 'terms' | 'contact', PageCopy> = {
  privacy: {
    title: 'Privacy policy',
    metaDescription: 'What this site collects, what it does not, and how to get rid of it.',
    lede: 'The short version: you can use this entire site without giving us anything. If you choose to make an account, we keep your email and your run, and nothing else.',
    sections: [
      section(
        'Who is responsible',
        'This site is operated by {entity}. For anything in this policy, write to {email}.',
        'Postal address: {address}',
      ),
      section(
        'If you just read the site',
        'You do not need an account, we do not ask for your name, and there is no tracking cookie, no advertising identifier and no profile. What we do record is that a page was opened, which is described under “Page views, which we count ourselves” below.',
        'Your run — which day you are on and which quests you have ticked — is stored by your own browser using local storage. It stays on your device and is never sent to us unless you sign in. Clearing your browser data deletes it, and we cannot recover it because we never had it.',
      ),
      section(
        'If you make an account',
        'An account is optional and exists for one purpose: opening the same run on another device. We store:',
        {
          ul: [
            '**Your email address** — to sign you in and, if necessary, to contact you about the account.',
            '**Your password** — stored only as a salted hash. We cannot read it.',
            '**Your run** — the day you are on and which quests you have marked done.',
          ],
        },
        'We do not ask for your name, and there is no profile, no newsletter, and no sharing of your email with anyone.',
      ),
      section(
        'If you send a correction',
        'The correction form stores what you type, the page you sent it from, and any source URL you supply. It has no name or email field. If you put personal information in the free text box, that is what we will have — so please do not.',
      ),
      section(
        'Cookies',
        'Signed out, the site sets no cookies. Signing in sets one authentication cookie so you stay signed in; it is strictly necessary for that and nothing else. Your theme choice and your run use local storage rather than cookies, which means they are never transmitted with requests. The page-view counting described next uses no cookie either.',
      ),
      section(
        'Page views, which we count ourselves',
        'We count page views on our own servers. No third-party analytics company is involved and nothing is sent anywhere else. When a page has finished loading, a small script tells our own server which page it was. For each page view we store:',
        {
          ul: [
            'The **page address** — the path only. The query string is removed before anything is written, so a search you typed into this site is never stored.',
            'Which of our sites it was, and the **hostname** you reached it on.',
            'The **hostname of the page that linked you to us**, if your browser sent one — the host only, never the full link. Most browsers send only the host, and many sites send nothing at all.',
            'The `utm_source`, `utm_medium` and `utm_campaign` tags, if the link you followed carried them.',
            'The **device type, browser family and operating system family** — desktop or mobile, Chrome or Safari, Windows or Android. These are read from the user-agent your browser sends and are stored as those three words, not as the string itself.',
            'A **two-letter country code**, where our hosting provider works one out from your connection and tells us. Where it does not, the country is recorded as “unknown” rather than guessed.',
            'A **reader code**: your IP address, your user-agent string and today’s date, put through a one-way hash together with a secret key.',
          ],
        },
        'We do not store your IP address, your user-agent string, your name, or anything from the query string of the page you were reading. The reader code cannot be turned back into an address, and because the date is part of it, it changes at midnight UTC every day — so it cannot be used to follow one person from one day to the next. Its only purpose is to tell one reader opening six pages apart from six readers opening one.',
        'Individual page views are deleted after 62 days. Before they are deleted they are added into daily totals — how many views each page, country, device and referring site had on each day — and those totals are kept indefinitely. The totals contain no reader code and nothing that refers to a person.',
        'If your browser sends the Global Privacy Control or Do Not Track signal, the script does not send anything and your visit is not recorded at all.',
        'If you are in the UK or EU, our legal basis is legitimate interest: knowing which pages of this site are read, and which are not, is how the site gets written. The balance rests on what is above — no address is stored, no cookie is set, the code that stands for a reader expires daily, and none of it is used for advertising or shared with anyone.',
      ),
      section(
        'Third-party analytics, and advertising',
        'We run neither. There is no Google Analytics, no Tag Manager, no Plausible and no Clarity on any page of this network, and no advertising of any kind. The settings for those tools exist and are empty, and while they are empty nothing from any of those companies is loaded. If one is ever switched on, this page will name the provider before it happens — advertising in particular usually involves third-party cookies and another company’s privacy policy, so we would say exactly whose. Our own page-view counting is the section above, and it is not one of these.',
      ),
      section(
        'Server logs',
        'Our hosting provider keeps standard access logs, which typically include IP address, browser user agent, and which page was requested. These are ordinary operational records used to keep the site running and to investigate abuse. We do not build profiles from them.',
      ),
      section('How long we keep things', {
        ul: [
          'Account and run data: until you delete the account.',
          'Corrections: until reviewed, then kept as a record of the change.',
          'Individual page views: 62 days, then deleted.',
          'Daily page-view totals, which name no reader and hold no code for one: indefinitely.',
          'Server logs: as long as the hosting provider retains them, typically weeks.',
        ],
      }),
      section(
        'Your rights',
        'If you are in the UK or EU, the UK GDPR and GDPR give you the right to access your data, correct it, delete it, take a copy elsewhere, and object to processing. Similar rights exist under California law and elsewhere. The only data we hold that is tied to a person is an account: an email address and a list of ticked quests. Write to {email} and we will action it. Page-view records are a separate matter and the honest answer is that we cannot find yours — they hold no address and no name, and the code that stands for a reader is a one-way hash that expires daily, so there is nothing we could match you to. If you would rather not be counted at all, the Global Privacy Control setting in your browser stops it.',
        'You can delete your account and everything attached to it yourself from your [account page](/account).',
        'Our legal basis for holding account data is performance of a contract — you asked us to save your run. For server logs it is legitimate interest in operating the site securely.',
      ),
      section(
        'Children',
        'This site is not directed at children under 13, and we do not knowingly hold data about them. If you believe we do, write to {email} and it will be deleted.',
      ),
      section(
        'Changes',
        'If this policy changes materially, the change will be described here rather than replaced silently.',
      ),
    ],
  },

  terms: {
    title: 'Terms of use',
    metaDescription: 'The rules for using this site, and the limits of what it promises.',
    lede: 'A fan network describing games made by other people. Here is what that does and does not promise.',
    sections: [
      section(
        'Who we are not',
        // `{rightsholders}` carries its own dashes: a network with nothing
        // published yet has nobody to name, and the sentence has to close up
        // round the gap rather than print a stray dash. See the terms page.
        'This site is an unofficial fan project operated by {entity}. It has no affiliation with, endorsement from, or connection to the developers and publishers of any game covered here{rightsholders} or anyone else involved in making them. All game names, characters and trademarks belong to their owners, and are used here for identification and commentary.',
      ),
      section(
        'Accuracy',
        'Read this part properly, because it is the one that matters. The information here is compiled from public sources and has not been verified against the game itself. It will contain errors. Every page shows a confidence rating and its sources so you can judge for yourself, and the run checker deliberately reports its totals as a floor rather than a figure.',
        'Use it as a guide, not an authority. We make no warranty that anything here is correct, complete or current. If it is wrong, please [tell us](/corrections).',
      ),
      section(
        'Your account',
        'Accounts are optional and free. Keep your password to yourself. We may suspend an account used to attack the site, abuse other people, or submit deliberately false data. You can delete yours at any time from the [account page](/account).',
      ),
      section(
        'What you send us',
        'If you submit a correction, you are confirming it is your own work or a fact you are free to pass on, and you are giving us permission to use it on the site. Do not submit copyrighted text from other sites.',
      ),
      section(
        'Our content',
        'The prose, the structure of the database and the tools are ours. Facts about the game belong to nobody. You are welcome to quote a page with a link back; please do not republish the database wholesale.',
      ),
      section(
        'Liability',
        'The site is provided as-is. To the extent the law allows, we are not liable for losses arising from using it — which for a video game guide realistically means a wasted playthrough, and we are sorry, but we did warn you above. Nothing here limits liability that cannot lawfully be limited.',
      ),
      section('Governing law', 'These terms are governed by the law of {jurisdiction}.'),
      section('Contact', 'Questions about these terms: {email}.'),
    ],
  },

  contact: {
    title: 'Contact',
    metaDescription: 'How to reach the person who runs this site.',
    lede: 'One person reads everything that arrives here.',
    sections: [
      section(
        'Something on the site is wrong',
        'Use the form below, or the report link at the foot of any page. It goes straight to a review queue and it is genuinely the most useful thing you can send us — this site is built without access to the game, so readers who have it are our best correction mechanism.',
      ),
      section(
        'Anything else',
        'Email {email} — press, takedown requests, data protection questions, or simply telling us we got something badly wrong.',
      ),
      section(
        'Not us',
        'We cannot help with bugs, refunds, or account problems in any of the games themselves. That is the game’s own developer or publisher, named on that wiki’s about page. See also our [terms](/terms) on why this is an unofficial site.',
      ),
    ],
  },
}

type StoredPage = {
  title?: unknown
  metaDescription?: unknown
  lede?: unknown
  sections?: unknown[]
}

const blank = (value: unknown): boolean =>
  value === null || value === undefined || (typeof value === 'string' && value.trim() === '')

const seed = async (payload: Payload): Promise<number> => {
  const current = (await payload.findGlobal({
    slug: 'legal-pages',
    depth: 0,
  })) as unknown as Record<string, StoredPage | undefined>

  let filled = 0
  const next: Record<string, unknown> = {}

  for (const [key, shipped] of Object.entries(PAGES)) {
    const existing = current?.[key] ?? {}
    const group: Record<string, unknown> = { ...existing }

    if (blank(existing.title)) {
      group.title = shipped.title
      filled += 1
    }
    if (blank(existing.metaDescription)) {
      group.metaDescription = shipped.metaDescription
      filled += 1
    }
    if (blank(existing.lede)) {
      group.lede = shipped.lede
      filled += 1
    }
    // One written section is a whole rewritten page, so the list is filled
    // only when it is entirely empty. Adding the shipped sections underneath
    // somebody's own would print the policy twice.
    if (!Array.isArray(existing.sections) || existing.sections.length === 0) {
      group.sections = shipped.sections
      filled += 1
    }

    next[key] = group
  }

  if (filled === 0) return 0

  await payload.updateGlobal({ slug: 'legal-pages', data: next as never })
  return filled
}

/* -------------------------------------------------------------------------- */
/* Correcting a stored section that has stopped being true                    */
/* -------------------------------------------------------------------------- */

/**
 * `seed` above never overwrites, and that is right almost always. This is the
 * case where it is not.
 *
 * When this network started counting its own page views, four sections of the
 * privacy policy stopped describing the site. Two of them became **false**:
 * "We collect nothing about you personally" and "Analytics and advertising are
 * both switched off by default". A privacy policy that is out of date is a
 * document making a statement about data handling that is not what happens,
 * which is the exact failure class this repository keeps finding - nothing
 * errors, the page looks finished, and the wrong version is the reassuring one.
 *
 * So this corrects them, and it is careful about which ones it touches:
 *
 *   - A section is replaced **only while it still contains the sentence this
 *     repository shipped**. That sentence is the evidence that nobody has
 *     redrafted it. If it has been changed, the section is left exactly as it
 *     is and printed instead, because an editor's own wording on a legal page
 *     is not something a seed pass gets to overwrite.
 *   - The new section describing what is collected is inserted only when no
 *     section of that name exists, so running this twice adds nothing.
 *
 * Whatever it cannot do, it says. And whatever it does, it says too: the
 * operator has to read the result, because this pass can keep a policy
 * accurate about mechanism and cannot make a legal judgement about it.
 */

type StoredSection = { heading?: string; body?: unknown; id?: string }

/** Every string in a Lexical document, joined. Enough to look for a sentence in. */
const plainText = (node: unknown): string => {
  if (!node || typeof node !== 'object') return ''
  const record = node as { text?: unknown; children?: unknown; root?: unknown }
  const parts: string[] = []
  if (typeof record.text === 'string') parts.push(record.text)
  if (record.root) parts.push(plainText(record.root))
  if (Array.isArray(record.children)) for (const child of record.children) parts.push(plainText(child))
  return parts.join(' ')
}

/**
 * The sentence that proves a section is still the one this repository wrote,
 * and the heading its replacement carries.
 *
 * Matched on a sentence rather than on the whole body because the whole body
 * is several paragraphs of rich text and an exact comparison would fail on a
 * typo fix, leaving a false statement in place for the sake of a comma.
 */
const CORRECTIONS: { heading: string; stillSays: string; becomes: string }[] = [
  {
    heading: 'If you just read the site',
    stillSays: 'We collect nothing about you personally',
    becomes: 'If you just read the site',
  },
  {
    heading: 'Analytics and advertising',
    stillSays: 'Both are switched off by default',
    becomes: 'Third-party analytics, and advertising',
  },
  {
    heading: 'Cookies',
    stillSays: 'they are never transmitted with requests.',
    becomes: 'Cookies',
  },
  {
    heading: 'How long we keep things',
    stillSays: 'Server logs: as long as the hosting provider retains them',
    becomes: 'How long we keep things',
  },
  {
    heading: 'Your rights',
    stillSays: 'the only personal data we hold is an email address',
    becomes: 'Your rights',
  },
]

/** The section that has to exist, and where it belongs when it does not. */
const NEW_SECTION = 'Page views, which we count ourselves'
const AFTER = 'Cookies'

export const correctPrivacy = async (payload: Payload): Promise<void> => {
  const current = (await payload.findGlobal({ slug: 'legal-pages', depth: 0 })) as unknown as {
    privacy?: { sections?: StoredSection[] }
  }
  const stored = current?.privacy?.sections
  // Nothing written means the page is rendering the built-in wording, which is
  // already the corrected one. `seed` above fills these in if they are empty.
  if (!Array.isArray(stored) || stored.length === 0) return

  const shipped = new Map(PAGES.privacy.sections.map((s) => [s.heading, s]))
  const next = stored.map((section) => ({ ...section }))
  const corrected: string[] = []
  const edited: string[] = []

  for (const rule of CORRECTIONS) {
    const index = next.findIndex((section) => section.heading === rule.heading)
    if (index === -1) continue
    const replacement = shipped.get(rule.becomes)
    if (!replacement) continue

    if (plainText(next[index].body).includes(rule.stillSays)) {
      next[index] = { ...next[index], heading: replacement.heading, body: replacement.body }
      corrected.push(rule.heading)
    } else {
      edited.push(rule.heading)
    }
  }

  let inserted = false
  if (!next.some((section) => section.heading === NEW_SECTION)) {
    const addition = shipped.get(NEW_SECTION)
    if (addition) {
      const at = next.findIndex((section) => section.heading === AFTER)
      next.splice(at === -1 ? next.length : at + 1, 0, { ...addition })
      inserted = true
    }
  }

  if (corrected.length === 0 && !inserted && edited.length === 0) return

  if (corrected.length > 0 || inserted) {
    await payload.updateGlobal({
      slug: 'legal-pages',
      data: { privacy: { ...current.privacy, sections: next } } as never,
    })
  }

  if (inserted) console.log(`  privacy: added the section "${NEW_SECTION}"`)
  for (const heading of corrected) console.log(`  privacy: rewrote "${heading}"`)
  for (const heading of edited) {
    console.log(
      `  privacy: LEFT ALONE "${heading}" - it has been edited since it shipped, so nothing here touched it. Check by hand that it still describes what the site does.`,
    )
  }
  console.log(
    '\n  The privacy policy now describes the page-view counting this network does.\n' +
      '  It was written to be factual about mechanism, not to be legal advice.\n' +
      '  READ /privacy AND CHECK IT before relying on it.\n',
  )
}

export default seed
