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
        'We collect nothing about you personally. No account, no tracking cookie, no profile.',
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
        'Signed out, the site sets no cookies. Signing in sets one authentication cookie so you stay signed in; it is strictly necessary for that and nothing else. Your theme choice and your run use local storage rather than cookies, which means they are never transmitted with requests.',
      ),
      section(
        'Analytics and advertising',
        'Both are switched off by default and load nothing while off. If they are ever switched on, this page will name the provider before it happens. Advertising, in particular, usually involves third-party cookies and a different company’s privacy policy, so we will say exactly whose.',
      ),
      section(
        'Server logs',
        'Our hosting provider keeps standard access logs, which typically include IP address, browser user agent, and which page was requested. These are ordinary operational records used to keep the site running and to investigate abuse. We do not build profiles from them.',
      ),
      section('How long we keep things', {
        ul: [
          'Account and run data: until you delete the account.',
          'Corrections: until reviewed, then kept as a record of the change.',
          'Server logs: as long as the hosting provider retains them, typically weeks.',
        ],
      }),
      section(
        'Your rights',
        'If you are in the UK or EU, the UK GDPR and GDPR give you the right to access your data, correct it, delete it, take a copy elsewhere, and object to processing. Similar rights exist under California law and elsewhere. Since the only personal data we hold is an email address and a list of ticked quests, these requests are simple — write to {email} and we will action it.',
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

export default seed
