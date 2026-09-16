import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/PageHeader'
import { EntityImage } from '@/components/EntityImage'
import { RelatedList, type RelatedItem } from '@/components/RelatedList'
import { getAll, getAllAcrossGames, getBySlug, gameUrl, relMany } from '@/lib/payload'
import type { Game } from '@/payload-types'

type Props = { params: Promise<{ slug: string }> }

export async function generateStaticParams() {
  const docs = await getAll('authors', { depth: 0 })
  return docs.map((doc) => ({ slug: doc.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const doc = await getBySlug('authors', slug, { depth: 0 })
  if (!doc) return {}
  return {
    title: `${doc.name} — guides and articles`,
    description: doc.bio ?? `Guides and articles written by ${doc.name}.`,
    alternates: { canonical: `/authors/${doc.slug}` },
    // A placeholder profile is not something we want indexed as a real person.
    /*
      Indexable, including while provisional.

      This used to hide every placeholder profile from search, on the reasoning
      that an invented expert should not be indexed. The flag is scaffolding
      for whoever fills the row in, though, and tying indexing to it meant a
      real contributor stayed invisible until somebody remembered to untick a
      box — which is exactly the kind of thing nobody remembers. Hiding a page
      is its own decision now, with its own switch below it in the admin.
    */
    robots: doc.noindex ? { index: false, follow: true } : undefined,
  }
}

export default async function AuthorPage({ params }: Props) {
  const { slug } = await params
  const doc = await getBySlug('authors', slug, { depth: 1 })
  if (!doc) notFound()

  /*
    A contributor writes across the network, not for one wiki, so this reads
    every game — the one place outside the hub that legitimately wants the
    union. It is also what makes the profile worth having for E-E-A-T: a body
    of work across seven games is evidence in a way that three articles on one
    site is not.

    Each guide lives on its own game's host, so the links have to be absolute.
  */
  const written = (await getAllAcrossGames('guides', { depth: 1, sort: 'title' })).filter(
    ({ doc: guide }) =>
      guide.author && typeof guide.author === 'object' && guide.author.slug === slug,
  )

  const covers = await Promise.all(
    relMany<Game>(doc.covers).map(async (wiki) => ({
      label: wiki.shortTitle || wiki.title,
      href: await gameUrl(wiki),
    })),
  )

  const items: RelatedItem[] = await Promise.all(
    written.map(async ({ doc: guide, game }) => ({
      id: guide.id,
      title: guide.title,
      href: `${await gameUrl(game)}/guides/${guide.slug}`,
      sub: guide.summary,
      meta: game.shortTitle || game.title,
    })),
  )

  return (
    <>
      <PageHeader
        eyebrow="Contributor"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Contributors', href: '/authors' }, { label: doc.name }]}
        icon="person"
        title={doc.name}
        lede={doc.role}
      />
      <div className="page body-main">
        <div className="split">
          <div className="stack">
            {doc.bio ? <p className="lede">{doc.bio}</p> : null}

            {/*
              Which wikis they write for, from the record rather than inferred
              from what they happen to have published. A contributor assigned
              to a game they have not written for yet is still the person
              responsible for it, and that is worth saying.
            */}
            {covers.length > 0 ? (
              <section className="section">
                <div className="section-head">
                  <h2>Writes for</h2>
                </div>
                <p className="badges">
                  {covers.map((wiki) => (
                    <a key={wiki.href} className="chip" href={wiki.href}>
                      {wiki.label}
                    </a>
                  ))}
                </p>
              </section>
            ) : null}
            {doc.links?.length ? (
              <section className="section">
                <div className="section-head">
                  <h2>Elsewhere</h2>
                </div>
                <ul className="related">
                  {doc.links.map((link) => (
                    <li key={link.id ?? link.url}>
                      <span className="related-main">
                        <a href={link.url} rel="nofollow noopener noreferrer" target="_blank">
                          {link.label}
                        </a>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
          <div className="stack">
            {/* No fallback icon: an empty frame reads as a missing image rather
                than as a person who has not supplied a photograph. */}
            <EntityImage media={doc.avatar} shape="square" />
          </div>
        </div>

        <RelatedList
          heading="Guides by this contributor"
          icon="book"
          items={items}
          emptyNote="Nothing is filed under this byline yet."
        />
      </div>
    </>
  )
}
