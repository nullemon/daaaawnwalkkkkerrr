import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/PageHeader'
import { CorrectionForm } from '@/components/CorrectionForm'
import { LegalField, LegalWarning } from '@/components/LegalGap'
import { isProvisional } from '@/lib/legal'
import { getSiteSettings } from '@/lib/payload'

export const metadata: Metadata = {
  title: 'Contact',
  description: 'How to reach the person who runs this site.',
  alternates: { canonical: '/contact' },
}

export default async function ContactPage() {
  const settings = await getSiteSettings()
  const provisional = settings.legalProvisional !== false
  const missing = [(provisional || isProvisional(settings.contactEmail)) && 'a contact email'].filter(
    Boolean,
  ) as string[]
  const email = <LegalField field="contact email" value={settings.contactEmail} provisional={provisional} />

  return (
    <>
      <PageHeader
        eyebrow="Contact"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Contact' }]}
        title="Get in touch"
        lede="One person reads everything that arrives here."
      />
      <div className="page body-main">
        <LegalWarning missing={missing} />

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

        <CorrectionForm />
      </div>
    </>
  )
}
