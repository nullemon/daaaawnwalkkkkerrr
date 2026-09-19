import type { Metadata, ResolvingMetadata } from 'next'
import { PageHeader } from '@/components/PageHeader'
import { EntityCard } from '@/components/EntityCard'
import { getAll, getAllAcrossGames, getSiteSettings } from '@/lib/payload'
import { copy } from '@/lib/copy'
import { socialMeta } from '@/lib/social'

export async function generateMetadata(
  _props: unknown,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const settings = await getSiteSettings()
  return {
    title: 'Contributors',
    description: `Who writes for ${settings.siteName}, and what each of them has written.`,
    alternates: { canonical: '/authors' },
    ...(await socialMeta(parent, { path: '/authors' })),
  }
}

/**
 * Who writes here.
 *
 * A contributor index is one of the few pages that exists as much for search
 * engines as for readers: a named person with a body of work attached is what
 * separates a site that is taken seriously from one that reads as generated.
 * That only works if the count against each name is real, so it is counted
 * from the guides rather than written in.
 */
export default async function AuthorsIndex() {
  const [settings, authors, guides] = await Promise.all([
    getSiteSettings(),
    getAll('authors', { depth: 1, sort: 'name' }),
    getAllAcrossGames('guides', { depth: 1 }),
  ])

  const counts = new Map<string, number>()
  for (const { doc } of guides) {
    const author = doc.author
    if (author && typeof author === 'object' && author.slug) {
      counts.set(author.slug, (counts.get(author.slug) ?? 0) + 1)
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="The network"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Contributors' }]}
        icon="person"
        title={copy(settings.authorsTitle, 'Contributors')}
        lede={copy(
          settings.authorsLede,
          'Guides are signed; the database pages are not, because a compiled fact sheet has no author to claim. Every byline links to a profile saying which wikis that contributor covers and what they have filed, so a reader can see who stood behind a page before deciding what it is worth.',
        )}
      />
      <div className="page body-main">
        <div className="grid">
          {authors.map((author) => {
            const written = counts.get(author.slug) ?? 0
            return (
              <EntityCard
              headingLevel={2}
                key={author.id}
                href={`/authors/${author.slug}`}
                title={author.name}
                summary={author.role}
                icon="person"
                badges={
                  written > 0 ? (
                    <span className="chip">
                      {written} {written === 1 ? 'guide' : 'guides'}
                    </span>
                  ) : null
                }
              />
            )
          })}
        </div>
      </div>
    </>
  )
}
