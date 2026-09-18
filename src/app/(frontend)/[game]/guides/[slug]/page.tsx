import type { Metadata, ResolvingMetadata } from 'next'
import { SectionNeighbours } from '@/components/SectionNeighbours'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/PageHeader'
import { Callout } from '@/components/Callout'
import { Confidence } from '@/components/Badges'
import { Linked, LinkedRichText } from '@/components/Linked'
import type { LinkScope } from '@/lib/link-index'
import { Sources } from '@/components/Sources'
import { Attribution } from '@/components/Attribution'
import { CommentThread } from '@/components/CommentThread'
import { Byline } from '@/components/Byline'
import { ArticleMeta } from '@/components/ArticleMeta'
import { EntityImage } from '@/components/EntityImage'
import { RelatedList, type RelatedItem } from '@/components/RelatedList'
import Link from 'next/link'
import { getAll, getBySlug, getGame, relMany } from '@/lib/payload'
import { rightsCredit } from '@/lib/credit'
import { gameName } from '@/lib/section-copy'
import { gameSlugParams } from '@/lib/params'
import { JsonLd } from '@/components/JsonLd'
import { clamp, guideKeywords } from '@/lib/seo'
import type { Author, Ending, Guide, Media, Quest } from '@/payload-types'
import { hub } from '@/lib/urls'
import { recordImage, socialMeta } from '@/lib/social'

type Props = { params: Promise<{ game: string; slug: string }> }

export const generateStaticParams = () => gameSlugParams('guides')

export async function generateMetadata(
  { params }: Props,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const { game, slug } = await params
  const doc = await getBySlug('guides', slug, { game, depth: 1 })
  if (!doc) return {}
  return {
    title: doc.seo?.title || doc.title,
    description: clamp(doc.seo?.description || doc.summary || ''),
    alternates: { canonical: `/guides/${doc.slug}` },
    /*
      Each article shares its own lead image, which is what this route has
      always meant to do — it just used to do it by writing `openGraph` out
      by hand, and Next replaces a parent's `openGraph` rather than merging
      into it. So 408 guides lost `og:site_name`, `og:type`, `og:locale` and
      the image's dimensions and alt text, the two guides with no lead image
      served *no* Open Graph tags at all, and `twitter:image` stayed inherited
      — one page offering Facebook the article's picture and X the wiki's key
      art. `socialMeta` restates the whole card and writes one image to both.

      `article`, not `website`: this page carries a byline, a modified date
      and `Article` JSON-LD, and og:type is the half of that a share preview
      reads. Records are `website` because they have no author and no date.
    */
    ...(await socialMeta(parent, {
      path: `/guides/${doc.slug}`,
      image: recordImage('guides', doc.image),
      type: 'article',
    })),
    /*
      The admin's own "Hide this page from search engines" box.
      `seoGroup()` puts it on every content collection and only the
      quest page read it, so ticking it anywhere else did nothing at
      all — a control that is present, reachable and inert.
    */
    robots: doc.seo?.noindex ? { index: false, follow: true } : undefined,
    keywords: guideKeywords(doc, gameName(await getGame(game))),
  }
}

export default async function GuidePage({ params }: Props) {
  const { game, slug } = await params
  const [wiki, doc] = await Promise.all([
    getGame(game),
    getBySlug('guides', slug, { game, depth: 1 }),
  ])
  if (!doc) notFound()

  /*
    Where this page is, for the inline linker.

    `self` is the whole reason it is passed: composed prose names the record it
    is about in its own first sentence, and a link from a page to itself reads
    as a bug. See `src/components/Linked.tsx`.
  */
  const scope: LinkScope = { host: 'wiki', game, self: `guides:${doc.id}` }

  // Only entries whose upload actually resolved; a broken one renders nothing
  // rather than an empty frame.
  const bodyImages = (doc.bodyImages ?? [])
    .map((entry) => ({
      id: entry.id ?? String(entry.image),
      caption: entry.caption,
      media: entry.image && typeof entry.image === 'object' ? (entry.image as Media) : null,
    }))
    .filter((entry): entry is typeof entry & { media: Media } => Boolean(entry.media?.url))

  const person = doc.author && typeof doc.author === 'object' ? (doc.author as Author) : null

  // What this guide is about, as links: the quests and endings an editor
  // attached to it. These are the records the reader most likely wants next.
  const covered: RelatedItem[] = [
    ...relMany<Quest>(doc.relatedQuests).map((quest) => ({
      id: `q${quest.id}`,
      title: quest.title,
      href: `/quests/${quest.slug}`,
      sub: quest.summary,
    })),
    ...relMany<Ending>(doc.relatedEndings).map((ending) => ({
      id: `e${ending.id}`,
      title: ending.title,
      href: `/endings/${ending.slug}`,
      sub: ending.summary,
    })),
  ]

  /*
    Six others, this one excluded. Newest first, so a guide written today is
    linked from every guide written before it.

    Sorted on `published` rather than on `updatedAt`. "Newest first" was
    sorting on the row's last database write, and every generator upserts
    every guide on every run — so after a `pnpm db:reset` all four hundred
    share a timestamp to the second and the order is whatever the writes
    happened to land in. The dates the page itself shows are the ones this
    ought to agree with.
  */
  const more: RelatedItem[] = (await getAll('guides', { game, depth: 0, sort: '-published' }))
    .filter((other) => other.slug !== slug)
    .slice(0, 6)
    .map((other) => ({ id: other.id, title: other.title, href: `/guides/${other.slug}` }))

  // Whose game the pictures are from, read off this game's own record rather
  // than assumed to be Dawnwalker's. See `rightsCredit`.
  const credit = rightsCredit(wiki)

  /*
    Article markup, so the byline and the date are readable by something other
    than a person squinting at the page.

    Every author goes in it, including a row still flagged `provisional`. This
    comment used to say the opposite — "a placeholder author is deliberately
    left out of it" — and nothing here has ever filtered on the flag, so the
    thirty-six placeholders have been named as `@type: Person` in the markup of
    394 guides the whole time.

    Leaving it that way is the smaller of two wrongs, not a good state. The
    alternative, dropping the author, silently removes a real contributor's
    credit the moment somebody forgets to untick a box — the exact failure that
    made `noindex` a separate switch from `provisional`. What the flag does
    instead is mark the profile this `url` points at, so a crawler that
    follows the author link lands on a page that says the name is a
    placeholder. If a real name is wanted here and nowhere else, the fix is to
    finish the roster, not to hide it.
  */
  const articleLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: doc.seo?.title || doc.title,
    description: clamp(doc.seo?.description || doc.summary || ''),
    ...(doc.updated ? { dateModified: new Date(doc.updated).toISOString() } : {}),
    /*
      `hub()`, not a bare path. A relative `url` in JSON-LD resolves against
      the page it is on, and this page is on a wiki: `/authors/<slug>` became
      `dawnwalker.<domain>/authors/<slug>`, which 404s, because contributor
      profiles exist once at the apex. The visible byline a hundred lines down
      already crosses the origin with `hub()` for that exact reason; the
      machine-readable copy of the same link did not, and a broken URL in
      structured data is the kind that nobody sees.
    */
    ...(person
      ? { author: { '@type': 'Person', name: person.name, url: hub(`/authors/${person.slug}`) } }
      : {}),
  }

  return (
    <>
      <JsonLd data={articleLd} />
      <PageHeader
        eyebrow="Guide"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Guides', href: '/guides' }, { label: doc.title }]}
        title={doc.title}
        subtitle={doc.subtitle}
        lede={doc.summary ? <Linked text={doc.summary} scope={scope} /> : undefined}
        badges={<Confidence level={doc.confidence} />}
      />
      <div className="page body-main">
        <Byline author={doc.author} published={doc.published} updated={doc.updated} />
        <div className="split">
          <div className="stack">
            <EntityImage media={doc.image} shape="wide" priority />
            <div className="prose">
              <LinkedRichText data={doc.body} scope={scope} />
            </div>

            {bodyImages.length > 0 ? (
              <section className="section">
                <div className="section-head">
                  <h2>{doc.bodyImagesHeading || 'What you are looking for'}</h2>
                </div>
                <div className="figurerow">
                  {bodyImages.map((entry) => (
                    <figure key={entry.id}>
                      <img
                        src={entry.media.sizes?.card?.url ?? entry.media.url ?? ''}
                        alt={entry.caption ?? entry.media.alt ?? ''}
                        loading="lazy"
                      />
                      {entry.caption ? <figcaption>{entry.caption}</figcaption> : null}
                    </figure>
                  ))}
                </div>
                {/* One credit for the row rather than one per picture. */}
                {credit ? <p className="note">{credit}</p> : null}
              </section>
            ) : null}

            {/*
              Provenance, as one block at the foot rather than four things
              scattered down the page.

              The citations used to sit here on their own under a caveat with
              no heading — the footnote nobody reads — while the only other
              thing a reader could use to place the article was a name at the
              top. Dates, byline, fact-check statement and sources now read as
              one answer to "who says so, and when".

              `Sources` is passed through unchanged, so Site settings → Content
              still decides whether the citation list prints. **It is off
              today**, which means every guide on the network shows the caveat
              and no citations; that is the owner's switch and not this route's
              to override. See the note in `src/components/Sources.tsx` about
              the two hosts that do carry a named exception, and why this is
              not a third one.
            */}
            <ArticleMeta
              published={doc.published}
              updated={doc.updated}
              author={doc.author}
              review={doc.review}
            >
              <Sources sources={doc.sources} />
              <Attribution sources={doc.sources} />
            </ArticleMeta>

            <SectionNeighbours
          collection="guides"
          game={game}
          slug={slug}
          label="guides"
        />
        <CommentThread game={game} path={`/guides/${slug}`} />
          </div>

          {/*
            The column beside a guide was empty, which on a wide screen is half
            the window doing nothing. It now carries the things a reader of this
            particular guide is most likely to want next: the records it is
            about, the tools that answer the same question with their own run in
            it, and the rest of the series.
          */}
          <div className="stack">
            {person ? (
              <section className="panel">
                <div className="panel-head">
                  <h2>Written by</h2>
                </div>
                <p>
                  <a href={hub(`/authors/${person.slug}`)}>{person.name}</a>
                  {person.role ? <span className="note"> · {person.role}</span> : null}
                </p>
                {person.bio ? <p className="note">{person.bio}</p> : null}
              </section>
            ) : null}

            <RelatedList heading="Covered here" icon="scroll" items={covered} />

            <Callout
              game={wiki}
              where="guides-detail"
              heading="Answer this for your own run"
              builtIn={(wiki?.features ?? []).includes('run-checker')}
            >
              <p>
                The <Link href="/tools/run-checker">run checker</Link> takes the quests you have
                actually finished and works out which endings are still reachable. The{' '}
                <Link href="/tools/build-planner">build planner</Link> does the same for a spec.
              </p>
            </Callout>

            <RelatedList heading="More guides" icon="book" items={more} href="/guides" />
          </div>
        </div>
      </div>
    </>
  )
}
