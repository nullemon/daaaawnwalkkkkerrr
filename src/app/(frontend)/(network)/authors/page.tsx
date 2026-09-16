import type { Metadata } from 'next'
import { PageHeader } from '@/components/PageHeader'
import { EntityCard } from '@/components/EntityCard'
import { getAll, getAllAcrossGames, getSiteSettings } from '@/lib/payload'

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings()
  return {
    title: 'Contributors',
    description: `Who writes for ${settings.siteName}, and what each of them has written.`,
    alternates: { canonical: '/authors' },
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
  const [authors, guides] = await Promise.all([
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
        title="Contributors"
        lede="Guides are signed; the database pages are not, because a compiled fact sheet has no author to claim. Where a byline is still a placeholder the page credits the editorial team instead of a name, and says so."
      />
      <div className="page body-main">
        <div className="grid">
          {authors.map((author) => {
            const written = counts.get(author.slug) ?? 0
            return (
              <EntityCard
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
