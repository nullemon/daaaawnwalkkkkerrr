import type { Metadata, ResolvingMetadata } from 'next'
import { Fragment } from 'react'
import Link from 'next/link'
import { PageHeader } from '@/components/PageHeader'
import { LegalField, LegalWarning } from '@/components/LegalGap'
import { copy } from '@/lib/copy'
import { getLegalCopy, legalBody, legalSections, legalTokens } from '@/lib/legal-copy'
import { isProvisional } from '@/lib/legal'
import { getPublishedGames, getSiteSettings } from '@/lib/payload'
import { listSentence, rightsholders } from '@/lib/credit'
import { socialMeta } from '@/lib/social'

/**
 * The wording this page shipped with, which is also what `pnpm seed:copy`
 * writes into the global. It stays here because blank means "use the
 * built-in": a global nobody has saved, or an editor who clears a field, must
 * leave the terms reading exactly as they do now.
 */
const TITLE = 'Terms of use'
const DESCRIPTION = 'The rules for using this site, and the limits of what it promises.'
const LEDE =
  'A fan network describing games made by other people. Here is what that does and does not promise.'

export async function generateMetadata(
  _props: unknown,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const stored = await getLegalCopy('terms')
  return {
    title: copy(stored.title, TITLE),
    description: copy(stored.metaDescription, DESCRIPTION),
    alternates: { canonical: '/terms' },
    ...(await socialMeta(parent, { path: '/terms' })),
  }
}

export default async function TermsPage() {
  const [settings, games, stored] = await Promise.all([
    getSiteSettings(),
    getPublishedGames(),
    getLegalCopy('terms'),
  ])
  // Named, not gestured at - see `rightsholders`.
  const holders = listSentence(rightsholders(games))
  const provisional = settings.legalProvisional !== false
  const missing = [
    (provisional || isProvisional(settings.legalEntity)) && 'who runs the site',
    (provisional || isProvisional(settings.jurisdiction)) && 'the governing law',
    (provisional || isProvisional(settings.contactEmail)) && 'a contact email',
  ].filter(Boolean) as string[]
  const entity = <LegalField field="legal entity" value={settings.legalEntity} provisional={provisional} />
  const email = <LegalField field="contact email" value={settings.contactEmail} provisional={provisional} />
  const jurisdiction = (
    <LegalField field="jurisdiction" value={settings.jurisdiction} provisional={provisional} />
  )

  const sections = legalSections(stored)
  // `{rightsholders}` is this page's own token: the list is read from the
  // games, not from settings, and it carries its own dashes because a network
  // with nothing published yet has nobody to name and the sentence has to
  // close up round the gap rather than print a stray dash.
  const tokens = legalTokens(settings, {
    rightsholders: holders ? <> — {holders} —</> : null,
  })

  return (
    <>
      <PageHeader
        eyebrow="Legal"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Terms' }]}
        title={copy(stored.title, TITLE)}
        lede={copy(stored.lede, LEDE)}
      />
      <div className="page body-main">
        <LegalWarning missing={missing} />

        {sections.length > 0 ? (
          <div className="prose">
            {sections.map((section, index) => (
              <Fragment key={section.id ?? index}>
                <h2>{section.heading}</h2>
                {legalBody(section.body, tokens)}
              </Fragment>
            ))}
          </div>
        ) : (
          <div className="prose">
            <h2>Who we are not</h2>
            <p>
              This site is an unofficial fan project operated by {entity}. It has no affiliation
              with, endorsement from, or connection to the developers and publishers of any game
              covered here{holders ? <> — {holders} —</> : null} or anyone else involved in making
              them. All game names, characters and trademarks belong to their owners, and are used
              here for identification and commentary.
            </p>

            <h2>Accuracy</h2>
            <p>
              Read this part properly, because it is the one that matters. The information here is
              compiled from public sources and has not been verified against the game itself. It will
              contain errors. Every page shows a confidence rating and its sources so you can judge for
              yourself, and the run checker deliberately reports its totals as a floor rather than a
              figure.
            </p>
            <p>
              Use it as a guide, not an authority. We make no warranty that anything here is correct,
              complete or current. If it is wrong, please{' '}
              <Link href="/corrections">tell us</Link>.
            </p>

            <h2>Your account</h2>
            <p>
              Accounts are optional and free. Keep your password to yourself. We may suspend an account
              used to attack the site, abuse other people, or submit deliberately false data. You can
              delete yours at any time from the <Link href="/account">account page</Link>.
            </p>

            <h2>What you send us</h2>
            <p>
              If you submit a correction, you are confirming it is your own work or a fact you are free
              to pass on, and you are giving us permission to use it on the site. Do not submit
              copyrighted text from other sites.
            </p>

            <h2>Our content</h2>
            <p>
              The prose, the structure of the database and the tools are ours. Facts about the game
              belong to nobody. You are welcome to quote a page with a link back; please do not
              republish the database wholesale.
            </p>

            <h2>Liability</h2>
            <p>
              The site is provided as-is. To the extent the law allows, we are not liable for losses
              arising from using it — which for a video game guide realistically means a wasted
              playthrough, and we are sorry, but we did warn you above. Nothing here limits liability
              that cannot lawfully be limited.
            </p>

            <h2>Governing law</h2>
            <p>These terms are governed by the law of {jurisdiction}.</p>

            <h2>Contact</h2>
            <p>Questions about these terms: {email}.</p>
          </div>
        )}
      </div>
    </>
  )
}
