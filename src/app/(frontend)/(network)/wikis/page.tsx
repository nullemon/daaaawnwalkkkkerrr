import type { Metadata } from 'next'
import { PageHeader } from '@/components/PageHeader'
import { WikiCard } from '@/components/WikiCard'
import { directory } from '@/lib/directory'
import { getSiteSettings } from '@/lib/payload'
import { copy } from '@/lib/copy'

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings()
  const wikis = await directory()
  const names = wikis.slice(0, 4).map((wiki) => wiki.game.shortTitle || wiki.game.title)

  return {
    // Just the page. The layout's template appends the network name, and
    // including it here as well produced "All wikis — X · X".
    title: 'All wikis',
    description: `Every game wiki on the network${names.length ? `, including ${names.join(', ')}` : ''}. Page counts are read from the database, not claimed.`,
    alternates: { canonical: '/wikis' },
  }
}

/**
 * The full directory.
 *
 * Split into what is playable now and what is not yet out. A reader browsing
 * for something to look up and a reader waiting for a launch want opposite
 * halves of this list, and mixing them makes both scroll past the other.
 */
export default async function WikisIndex() {
  const [settings, wikis] = await Promise.all([getSiteSettings(), directory()])
  const now = Date.now()

  const isUpcoming = (release?: string | null) =>
    Boolean(release && new Date(release).getTime() > now)

  const out = wikis.filter((wiki) => !isUpcoming(wiki.game.releaseDate))
  const upcoming = wikis.filter((wiki) => isUpcoming(wiki.game.releaseDate))

  return (
    <>
      <PageHeader
        eyebrow="Directory"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'All wikis' }]}
        icon="book"
        title={copy(settings.wikisTitle, 'Every wiki on the network')}
        lede={copy(
          settings.wikisLede,
          'Each one is its own site with its own database. The page counts below are read from those databases when this page is built, so they are what is actually there rather than what we would like to claim.',
        )}
      />

      <div className="page body-main">
        {out.length > 0 ? (
          <section className="section">
            <div className="section-head">
              <h2>{copy(settings.outNowHeading, 'Out now')}</h2>
            </div>
            <div className="tilegrid">
              {out.map((entry) => (
                <WikiCard key={entry.game.id} entry={entry} />
              ))}
            </div>
          </section>
        ) : null}

        {upcoming.length > 0 ? (
          <section className="section">
            <div className="section-head">
              <h2>{copy(settings.notOutYetHeading, 'Not out yet')}</h2>
              <p className="note">
                {copy(
                  settings.notOutYetNote,
                  'Built ahead of release from what publishers have confirmed. Everything on these is marked with where it came from, and the day the game ships is the day most of it gets checked against it.',
                )}
              </p>
            </div>
            <div className="tilegrid">
              {upcoming.map((entry) => (
                <WikiCard key={entry.game.id} entry={entry} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </>
  )
}
