import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/PageHeader'
import { RequestForm } from '@/components/RequestForm'

export const metadata: Metadata = {
  title: 'Request a feature',
  description:
    'Tell us what this site should do that it does not. Feature requests, missing data, and guides you want written.',
  alternates: { canonical: '/requests' },
  // A form is not a landing page. Indexing it competes with the pages that
  // answer something, and there is nothing here for a searcher to read.
  robots: { index: false, follow: true },
}

export default function RequestsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Help us"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Request a feature' }]}
        icon="spark"
        title="What should this site do next?"
        lede="This site is built around one question — what can you still reach from where you are. If there is something else you keep wanting it to answer, tell us and it goes on the list."
      />
      <div className="page body-main">
        <div className="split">
          <div className="stack">
            <RequestForm />
          </div>
          <div className="stack">
            <div className="callout">
              <h2>Found something wrong instead?</h2>
              <p>
                That goes in a different queue. <Link href="/corrections">Report an error</Link> —
                accuracy reports are triaged against sources and get looked at first.
              </p>
            </div>
            <section className="panel">
              <div className="panel-head">
                <h2>What tends to get built</h2>
              </div>
              <p className="note">
                Things asked for more than once, and things that make an existing answer easier to
                reach. A request that would mean publishing a figure no source supports will not be
                built, however often it comes in — that constraint is the point of the site rather
                than an oversight.
              </p>
            </section>
          </div>
        </div>
      </div>
    </>
  )
}
