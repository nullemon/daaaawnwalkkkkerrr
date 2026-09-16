import type { Metadata } from 'next'
import { Fragment } from 'react'
import Link from 'next/link'
import { PageHeader } from '@/components/PageHeader'
import { CorrectionForm } from '@/components/CorrectionForm'
import { LegalField, LegalWarning } from '@/components/LegalGap'
import { copy } from '@/lib/copy'
import { getLegalCopy, legalBody, legalSections, legalTokens } from '@/lib/legal-copy'
import { isProvisional } from '@/lib/legal'
import { getSiteSettings } from '@/lib/payload'

/**
 * The wording this page shipped with, which is also what `pnpm seed:copy`
 * writes into the global. It stays here because blank means "use the
 * built-in": a global nobody has saved, or an editor who clears a field, must
 * leave the page reading exactly as it does now.
 */
const TITLE = 'Contact'
const DESCRIPTION = 'How to reach the person who runs this site.'
const LEDE = 'One person reads everything that arrives here.'

export async function generateMetadata(): Promise<Metadata> {
  const stored = await getLegalCopy('contact')
  return {
    title: copy(stored.title, TITLE),
    description: copy(stored.metaDescription, DESCRIPTION),
    alternates: { canonical: '/contact' },
  }
}

export default async function ContactPage() {
  const [settings, stored] = await Promise.all([getSiteSettings(), getLegalCopy('contact')])
  const provisional = settings.legalProvisional !== false
  const missing = [(provisional || isProvisional(settings.contactEmail)) && 'a contact email'].filter(
    Boolean,
  ) as string[]
  const email = <LegalField field="contact email" value={settings.contactEmail} provisional={provisional} />

  const sections = legalSections(stored)
  const tokens = legalTokens(settings)

  return (
    <>
      <PageHeader
        eyebrow="Contact"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Contact' }]}
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
            <h2>Something on the site is wrong</h2>
            <p>
              Use the form below, or the report link at the foot of any page. It goes straight to a
              review queue and it is genuinely the most useful thing you can send us — this site is
              built without access to the game, so readers who have it are our best correction
              mechanism.
            </p>

            <h2>Anything else</h2>
            <p>
              Email {email} — press, takedown requests, data protection questions, or simply telling us
              we got something badly wrong.
            </p>

            <h2>Not us</h2>
            <p>
              We cannot help with bugs, refunds, or account problems in any of the games themselves.
              That is the game&rsquo;s own developer or publisher, named on that wiki&rsquo;s about
              page. See also our <Link href="/terms">terms</Link> on why this is an unofficial site.
            </p>
          </div>
        )}

        {/* The form is the page's reason to exist, so it is not editable copy
            and does not disappear when somebody rewrites the sections above. */}
        <CorrectionForm />
      </div>
    </>
  )
}
