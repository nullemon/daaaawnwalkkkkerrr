import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/PageHeader'
import { EntityImage } from '@/components/EntityImage'
import { RelatedList, type RelatedItem } from '@/components/RelatedList'
import { getAll, getBySlug } from '@/lib/payload'
import type { Author, Guide } from '@/payload-types'

type Props = { params: Promise<{ slug: string }> }

export async function generateStaticParams() {
  const docs = await getAll<Author>('authors', { depth: 0 })
  return docs.map((doc) => ({ slug: doc.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const doc = await getBySlug<Author>('authors', slug, 0)
  if (!doc) return {}
  return {
    title: `${doc.name} — guides and articles`,
    description: doc.bio ?? `Guides written by ${doc.name} for the Dawnwalker Guide.`,
    alternates: { canonical: `/authors/${doc.slug}` },
    // A placeholder profile is not something we want indexed as a real person.
    robots: doc.provisional ? { index: false, follow: true } : undefined,
  }
}

export default async function AuthorPage({ params }: Props) {
  const { slug } = await params
  const doc = await getBySlug<Author>('authors', slug, 1)
  if (!doc) notFound()

  const guides = (await getAll<Guide>('guides', { depth: 1, sort: 'title' })).filter(
    (guide) => guide.author && typeof guide.author === 'object' && guide.author.slug === slug,
  )

  const items: RelatedItem[] = guides.map((guide) => ({
    id: guide.id,
    title: guide.title,
    href: `/guides/${guide.slug}`,
    sub: guide.summary,
  }))

  return (
    <>
      <PageHeader
        eyebrow="Contributor"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Guides', href: '/guides' }, { label: doc.name }]}
        icon="person"
        title={doc.name}
        lede={doc.role}
      />
      <div className="page body-main">
        {doc.provisional ? (
          <div className="callout" data-tone="risk">
            <h3>This profile is a placeholder</h3>
            <p>
              Nobody of this name has written anything here. The site seeds contributor profiles so
              the byline, the layout and the structured data are all in place, and the owner
              replaces them with real people in the admin — at which point this notice disappears.
              Until then the page is marked <code>noindex</code> and the name is left out of the
              article markup.
            </p>
          </div>
        ) : null}

        <div className="split">
          <div className="stack">
            {doc.bio ? <p className="lede">{doc.bio}</p> : null}
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
            <EntityImage media={doc.avatar} shape="square" fallbackIcon="person" />
          </div>
        </div>

        <RelatedList
          heading="Guides by this contributor"
          icon="book"
          items={items}
          href="/guides"
          emptyNote="Nothing is filed under this byline yet."
        />
      </div>
    </>
  )
}
