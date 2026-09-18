import type { Metadata, ResolvingMetadata } from 'next'
import { Fragment } from 'react'
import Link from 'next/link'
import { PageHeader } from '@/components/PageHeader'
import { LegalField, LegalGap, LegalWarning } from '@/components/LegalGap'
import { copy } from '@/lib/copy'
import { getLegalCopy, legalBody, legalSections, legalTokens } from '@/lib/legal-copy'
import { isProvisional } from '@/lib/legal'
import { getSiteSettings } from '@/lib/payload'
import { socialMeta } from '@/lib/social'

/**
 * The wording this page shipped with, which is also what `pnpm seed:copy`
 * writes into the global. It stays here because blank means "use the
 * built-in": a global nobody has saved, or an editor who clears a field, must
 * leave the policy reading exactly as it does now rather than blank a heading.
 */
const TITLE = 'Privacy policy'
const DESCRIPTION = 'What this site collects, what it does not, and how to get rid of it.'
const LEDE =
  'The short version: you can use this entire site without giving us anything. If you choose to make an account, we keep your email and your run, and nothing else.'

export async function generateMetadata(
  _props: unknown,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const stored = await getLegalCopy('privacy')
  return {
    title: copy(stored.title, TITLE),
    description: copy(stored.metaDescription, DESCRIPTION),
    alternates: { canonical: '/privacy' },
    ...(await socialMeta(parent, { path: '/privacy' })),
  }
}

export default async function PrivacyPage() {
  const [settings, stored] = await Promise.all([getSiteSettings(), getLegalCopy('privacy')])
  const provisional = settings.legalProvisional !== false
  const missing = [
    (provisional || isProvisional(settings.legalEntity)) && 'who runs the site',
    (provisional || isProvisional(settings.contactEmail)) && 'a contact email',
    (provisional || isProvisional(settings.postalAddress)) && 'a postal address',
  ].filter(Boolean) as string[]

  const entity = <LegalField field="legal entity" value={settings.legalEntity} provisional={provisional} />
  const email = <LegalField field="contact email" value={settings.contactEmail} provisional={provisional} />

  // Written sections replace the whole body, not part of it — a policy half
  // from the database and half from the code would read as two documents and
  // repeat itself. The values inside them still arrive as `LegalField`s.
  const sections = legalSections(stored)
  const tokens = legalTokens(settings)

  return (
    <>
      <PageHeader
        eyebrow="Legal"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Privacy' }]}
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
              You do not need an account, we do not ask for your name, and there is no tracking
              cookie, no advertising identifier and no profile. What we do record is that a page was
              opened, which is described under &ldquo;Page views, which we count ourselves&rdquo;
              below.
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
              with requests. The page-view counting described next uses no cookie either.
            </p>

            <h2>Page views, which we count ourselves</h2>
            <p>
              We count page views on our own servers. No third-party analytics company is involved
              and nothing is sent anywhere else. When a page has finished loading, a small script
              tells our own server which page it was. For each page view we store:
            </p>
            <ul>
              <li>
                The <strong>page address</strong> &mdash; the path only. The query string is removed
                before anything is written, so a search you typed into this site is never stored.
              </li>
              <li>Which of our sites it was, and the <strong>hostname</strong> you reached it on.</li>
              <li>
                The <strong>hostname of the page that linked you to us</strong>, if your browser sent
                one &mdash; the host only, never the full link. Most browsers send only the host, and
                many sites send nothing at all.
              </li>
              <li>
                The <code>utm_source</code>, <code>utm_medium</code> and <code>utm_campaign</code>{' '}
                tags, if the link you followed carried them.
              </li>
              <li>
                The <strong>device type, browser family and operating system family</strong> &mdash;
                desktop or mobile, Chrome or Safari, Windows or Android. These are read from the
                user-agent your browser sends and are stored as those three words, not as the string
                itself.
              </li>
              <li>
                A <strong>two-letter country code</strong>, where our hosting provider works one out
                from your connection and tells us. Where it does not, the country is recorded as
                &ldquo;unknown&rdquo; rather than guessed.
              </li>
              <li>
                A <strong>reader code</strong>: your IP address, your user-agent string and
                today&rsquo;s date, put through a one-way hash together with a secret key.
              </li>
            </ul>
            <p>
              We do not store your IP address, your user-agent string, your name, or anything from
              the query string of the page you were reading. The reader code cannot be turned back
              into an address, and because the date is part of it, it changes at midnight UTC every
              day &mdash; so it cannot be used to follow one person from one day to the next. Its
              only purpose is to tell one reader opening six pages apart from six readers opening
              one.
            </p>
            <p>
              Individual page views are deleted after 62 days. Before they are deleted they are added
              into daily totals &mdash; how many views each page, country, device and referring site
              had on each day &mdash; and those totals are kept indefinitely. The totals contain no
              reader code and nothing that refers to a person.
            </p>
            <p>
              If your browser sends the Global Privacy Control or Do Not Track signal, the script
              does not send anything and your visit is not recorded at all.
            </p>
            <p>
              If you are in the UK or EU, our legal basis is legitimate interest: knowing which pages
              of this site are read, and which are not, is how the site gets written. The balance
              rests on what is above &mdash; no address is stored, no cookie is set, the code that
              stands for a reader expires daily, and none of it is used for advertising or shared
              with anyone.
            </p>

            <h2>Third-party analytics, and advertising</h2>
            <p>
              We run neither. There is no Google Analytics, no Tag Manager, no Plausible and no
              Clarity on any page of this network, and no advertising of any kind. The settings for
              those tools exist and are empty, and while they are empty nothing from any of those
              companies is loaded. If one is ever switched on, this page will name the provider
              before it happens &mdash; advertising in particular usually involves third-party
              cookies and another company&rsquo;s privacy policy, so we would say exactly whose. Our
              own page-view counting is the section above, and it is not one of these.
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
              <li>Individual page views: 62 days, then deleted.</li>
              <li>
                Daily page-view totals, which name no reader and hold no code for one: indefinitely.
              </li>
              <li>Server logs: as long as the hosting provider retains them, typically weeks.</li>
            </ul>

            <h2>Your rights</h2>
            <p>
              If you are in the UK or EU, the UK GDPR and GDPR give you the right to access your data,
              correct it, delete it, take a copy elsewhere, and object to processing. Similar rights
              exist under California law and elsewhere. The only data we hold that is tied to a
              person is an account: an email address and a list of ticked quests. Write to {email}{' '}
              and we will action it. Page-view records are a separate matter, and the honest answer
              is that we cannot find yours: they hold no address and no name, and the code that
              stands for a reader is a one-way hash that expires daily, so there is nothing we could
              match you to. If you would rather not be counted at all, the Global Privacy Control
              setting in your browser stops it.
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
        )}
      </div>
    </>
  )
}
