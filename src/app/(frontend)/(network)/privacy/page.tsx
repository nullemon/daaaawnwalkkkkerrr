import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/PageHeader'
import { LegalField, LegalGap, LegalWarning } from '@/components/LegalGap'
import { isProvisional } from '@/lib/legal'
import { getSiteSettings } from '@/lib/payload'

export const metadata: Metadata = {
  title: 'Privacy policy',
  description: 'What this site collects, what it does not, and how to get rid of it.',
  alternates: { canonical: '/privacy' },
}

export default async function PrivacyPage() {
  const settings = await getSiteSettings()
  const provisional = settings.legalProvisional !== false
  const missing = [
    (provisional || isProvisional(settings.legalEntity)) && 'who runs the site',
    (provisional || isProvisional(settings.contactEmail)) && 'a contact email',
    (provisional || isProvisional(settings.postalAddress)) && 'a postal address',
  ].filter(Boolean) as string[]

  const entity = <LegalField field="legal entity" value={settings.legalEntity} provisional={provisional} />
  const email = <LegalField field="contact email" value={settings.contactEmail} provisional={provisional} />

  return (
    <>
      <PageHeader
        eyebrow="Legal"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Privacy' }]}
        title="Privacy policy"
        lede="The short version: you can use this entire site without giving us anything. If you choose to make an account, we keep your email and your run, and nothing else."
      />
      <div className="page body-main">
        <LegalWarning missing={missing} />

        <div className="prose">
          <h2>Who is responsible</h2>
          <p>
            This site is operated by {entity}. For anything in this policy, write to {email}.
          </p>
          {settings.postalAddress ? (
            <p style={{ whiteSpace: 'pre-line' }}>
              <LegalField
                field="postal address"
                value={settings.postalAddress}
                provisional={provisional}
              />
            </p>
          ) : (
            <p>
              Postal address: <LegalGap field="postal address" />
            </p>
          )}

          <h2>If you just read the site</h2>
          <p>
            We collect nothing about you personally. No account, no tracking cookie, no profile.
          </p>
          <p>
            Your run — which day you are on and which quests you have ticked — is stored by your own
            browser using local storage. It stays on your device and is never sent to us unless you
            sign in. Clearing your browser data deletes it, and we cannot recover it because we never
            had it.
          </p>

          <h2>If you make an account</h2>
          <p>An account is optional and exists for one purpose: opening the same run on another device. We store:</p>
          <ul>
            <li>
              <strong>Your email address</strong> — to sign you in and, if necessary, to contact you
              about the account.
            </li>
            <li>
              <strong>Your password</strong> — stored only as a salted hash. We cannot read it.
            </li>
            <li>
              <strong>Your run</strong> — the day you are on and which quests you have marked done.
            </li>
          </ul>
          <p>
            We do not ask for your name, and there is no profile, no newsletter, and no sharing of
            your email with anyone.
          </p>

          <h2>If you send a correction</h2>
          <p>
            The correction form stores what you type, the page you sent it from, and any source URL
            you supply. It has no name or email field. If you put personal information in the free
            text box, that is what we will have — so please do not.
          </p>

          <h2>Cookies</h2>
          <p>
            Signed out, the site sets no cookies. Signing in sets one authentication cookie so you
            stay signed in; it is strictly necessary for that and nothing else. Your theme choice and
            your run use local storage rather than cookies, which means they are never transmitted
            with requests.
          </p>

          <h2>Analytics and advertising</h2>
          <p>
            Both are switched off by default and load nothing while off. If they are ever switched
            on, this page will name the provider before it happens. Advertising, in particular,
            usually involves third-party cookies and a different company&rsquo;s privacy policy, so
            we will say exactly whose.
          </p>

          <h2>Server logs</h2>
          <p>
            Our hosting provider keeps standard access logs, which typically include IP address,
            browser user agent, and which page was requested. These are ordinary operational records
            used to keep the site running and to investigate abuse. We do not build profiles from
            them.
          </p>

          <h2>How long we keep things</h2>
          <ul>
            <li>Account and run data: until you delete the account.</li>
            <li>Corrections: until reviewed, then kept as a record of the change.</li>
            <li>Server logs: as long as the hosting provider retains them, typically weeks.</li>
          </ul>

          <h2>Your rights</h2>
          <p>
            If you are in the UK or EU, the UK GDPR and GDPR give you the right to access your data,
            correct it, delete it, take a copy elsewhere, and object to processing. Similar rights
            exist under California law and elsewhere. Since the only personal data we hold is an
            email address and a list of ticked quests, these requests are simple — write to {email}{' '}
            and we will action it.
          </p>
          <p>
            You can delete your account and everything attached to it yourself from your{' '}
            <Link href="/account">account page</Link>.
          </p>
          <p>
            Our legal basis for holding account data is performance of a contract — you asked us to
            save your run. For server logs it is legitimate interest in operating the site securely.
          </p>

          <h2>Children</h2>
          <p>
            This site is not directed at children under 13, and we do not knowingly hold data about
            them. If you believe we do, write to {email} and it will be deleted.
          </p>

          <h2>Changes</h2>
          <p>
            If this policy changes materially, the change will be described here rather than
            replaced silently.
          </p>
        </div>
      </div>
    </>
  )
}
