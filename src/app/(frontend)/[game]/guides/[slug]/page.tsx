import type { Metadata, ResolvingMetadata } from 'next'
import { SectionNeighbours } from '@/components/SectionNeighbours'
import { notFound } from 'next/navigation'
import { Callout } from '@/components/Callout'
import { Confidence } from '@/components/Badges'
import { Linked, LinkedRichText } from '@/components/Linked'
import type { LinkScope } from '@/lib/link-index'
import { Icon } from '@/components/Icon'
import { Sources } from '@/components/Sources'
import { Attribution } from '@/components/Attribution'
import { CommentThread } from '@/components/CommentThread'
import { Byline } from '@/components/Byline'
import { ArticleMeta } from '@/components/ArticleMeta'
import { ImageCredit } from '@/components/ImageCredit'
import { RelatedList, type RelatedItem } from '@/components/RelatedList'
import { Contents } from '@/components/Contents'
import { Takeaways } from '@/components/Takeaways'
import { ShareRow } from '@/components/ShareRow'
import { articleHeadings, articleWords, readingMinutes } from '@/lib/article'
import { getUi } from '@/lib/ui'
import { fill } from '@/lib/copy'
import Link from 'next/link'
import {
  gameUrl,
  getAll,
  getBySlug,
  getDatedGuides,
  getGame,
  getGuideImages,
  getSiteSettings,
  relMany,
} from '@/lib/payload'
import { rightsCredit } from '@/lib/credit'
import { gameName } from '@/lib/section-copy'
import { gameSlugParams } from '@/lib/params'
import { JsonLd } from '@/components/JsonLd'
import { article } from '@/lib/schema'
import { relatedGuides } from '@/lib/related-guides'
import { guideDates, guideLastModified } from '@/lib/guide-dates'
import { clamp, guideKeywords } from '@/lib/seo'
import type { Author, Ending, Guide, Media, Quest } from '@/payload-types'
import { hub } from '@/lib/urls'
import { cardImage, socialMeta } from '@/lib/social'

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
      /*
        A drawn card rather than the guide's own screenshot.

        `recordImage` handed an unfurler the lead photograph on its own: no
        headline, no wiki name, and — the part that matters — no rightsholder
        anywhere near it, because the credit line this site prints inside every
        picture does not travel into an Open Graph tag. A Capcom screenshot
        posted to Slack under our wordmark with nothing saying whose it is was
        the same claim `creditBasis` exists to stop, made in the one place the
        page's own defences cannot reach.

        `/api/og/guides/<slug>` draws the picture, the headline, the wiki name
        and the credit into one 1200x630 card, and falls back to a drawn ground
        the moment it cannot print the credit in full. See the route.
      */
      image: cardImage('guides', doc),
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
    /*
      Depth 1, and the second level went with the portrait.

      This was depth 2, and the extra hop existed for exactly one field: the
      `avatar` upload hanging off `author`, which needs a second level to come
      back as anything but an id. The masthead does not print a portrait any
      more, so the second level was buying nothing and costing an extra join on
      every one of four hundred prerendered pages.

      Everything this page still reads is one hop: the lead image, the author's
      name and bio, the body images, the citations and the reviewer. If a
      portrait is ever wanted here again this has to go back to 2 in the same
      commit — `Byline` would render nothing and say nothing about why, which
      is how the missing portrait survived for as long as it did.
    */
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

  /*
    This guide's own picture, or nothing.

    Nothing is the honest answer for the two guides on the network that have
    none: a placeholder frame, or worse another game's screenshot, is the
    misattribution `ART_GAME` and `sectionArt` exist to prevent. `seed:guide-images`
    draws every one of these from that game's own store listing — see its
    header for why a guide may carry a photograph at all when a record may not.
  */
  const lead = doc.image && typeof doc.image === 'object' ? (doc.image as Media) : null

  const person = doc.author && typeof doc.author === 'object' ? (doc.author as Author) : null

  /*
    What this guide is about, as links: the quests and endings an editor
    attached to it. These are the records the reader most likely wants next.

    Titles only. `RelatedItem` carries a `sub` and this used to pass each
    record's summary into it, which in a 300px rail is two or three wrapped
    lines per row — a sidebar taller than the article, made of sentences
    nobody came here to read. The index pages are where a summary earns its
    space; a rail is a list of doors.
  */
  const covered: RelatedItem[] = [
    ...relMany<Quest>(doc.relatedQuests).map((quest) => ({
      id: `q${quest.id}`,
      title: quest.title,
      href: `/quests/${quest.slug}`,
    })),
    ...relMany<Ending>(doc.relatedEndings).map((ending) => ({
      id: `e${ending.id}`,
      title: ending.title,
      href: `/endings/${ending.slug}`,
    })),
  ]

  /*
    Six others, chosen by what they have in common with this one.

    This was `sort: '-published', limit: 7`, which gave every article on a wiki
    close to the same six links — and the guide-dates work sharpened that
    rather than fixing it, because `published` is an editor's field now, so the
    sixty-one guides carrying one sort to the front and the rest follow in
    database order. Six identical links on four hundred pages are not
    navigation. The previous note called this an editorial question; it is not,
    because there is a rule in the data that answers it.

    `relatedGuides` ranks on the words two titles share once the game's own
    name is discounted — `lib/terms.ts`, the same code as the hub's query
    matcher and the topic generator, which is where the discount and the reason
    for it live. Nothing with no shared word is ever shown as related; the rail
    tops up from the newest guides instead, and says nothing about them that it
    cannot support.

    The whole collection is read again, which the `limit: 7` was there to
    avoid. It is `depth: 0` for the ranking and a second, tiny query at depth 1
    for the pictures of the six that win, so what this costs is six resolved
    images per page rather than four hundred rich-text bodies — the shape the
    `limit: 1000, depth: 0` version was rightly replaced for.
  */
  const ranked = relatedGuides(
    { id: doc.id, title: doc.title, slug: doc.slug, targetQuery: doc.targetQuery },
    (await getDatedGuides(game)).map((other) => ({
      id: other.slug,
      title: other.title,
      slug: other.slug,
      /*
        `targetQuery` is not selected for the candidates and the title carries
        the ranking on its own. It is read for *this* guide, where one extra
        field costs one column of one row, and skipped for the other four
        hundred, where it is a column of four hundred rows on four hundred
        pages. The asymmetry is deliberate: a question asked on one side of a
        comparison still matches the words in a title on the other.
      */
      targetQuery: null,
      date: guideLastModified(other) ?? null,
    })),
    /*
      Every spelling of the game's own name, so none of them can carry a
      comparison. `title` is the store title and `shortTitle` is what people
      type; the slug is neither and matches "e-day" written as one word.
    */
    [wiki?.title, wiki?.shortTitle, game.replace(/-/g, ' ')].filter(Boolean) as string[],
  )

  const artFor = await getGuideImages(
    game,
    ranked.map((other) => other.slug),
  )

  const more = ranked.map((other) => {
    const image = artFor.get(other.slug)
    const picture = image && typeof image === 'object' ? (image as Media) : null
    return {
      id: other.id,
      title: other.title,
      href: `/guides/${other.slug}`,
      // The 320px square crop, not the 768px card: six cards is 340KB of
      // sidebar. A 96px slot does not need more than the thumbnail.
      thumb: picture?.sizes?.thumb?.url ?? picture?.url ?? null,
    }
  })

  // Whose game the pictures are from, read off this game's own record rather
  // than assumed to be Dawnwalker's. See `rightsCredit`.
  const credit = rightsCredit(wiki)
  const creditsInPicture = Boolean((await getSiteSettings()).showImageCredits)

  const ui = await getUi()

  /*
    Two things read off the article itself, neither of them a claim about the
    game: which sections it has, and how many words it is. See
    `src/lib/article.ts` — the contents list and the ids on the headings come
    from the same derivation, which is the only reason they cannot drift.
  */
  const headings = articleHeadings(doc.body)
  const minutes = readingMinutes(articleWords(doc.body))

  /*
    This page's own absolute address, for the share links.

    Built from `gameUrl` rather than from the browser's location or from a
    relative path: a wiki is its own origin, and a share intent that received
    `/guides/x` would send somebody to the service's own domain. The share row
    is a client component and cannot await this, so the server hands it down —
    which is also what makes it correct on a prerendered page.
  */
  const canonical = wiki ? `${await gameUrl(wiki)}/guides/${doc.slug}` : null

  /*
    Every date this page is entitled to state, derived once and used four
    times: the byline, the "About this article" panel, the Article markup and
    — through the same function — the sitemap and the feeds.

    Read it in `src/lib/guide-dates.ts`. The short version is that 349 of the
    410 guides have no `updated` field and none of the generated ones have an
    honest publication day, so this page printed no date at all on most of the
    network while the sitemap for the same URL published the row's `updatedAt`
    — the afternoon somebody last ran the seed. `updated` is the newest day one
    of this guide's own citations was read, which is a fact out of committed
    JSON; `published` stays an editor's field and blank stays blank.
  */
  const dates = guideDates(doc)

  /*
    Article markup, built by `article()` rather than written out here.

    It was written out here, which is how the dates came to differ from the
    ones in the sitemap for the same URL. The `hub()` reasoning that used to
    sit in this comment — a relative author URL in JSON-LD resolves against the
    wiki subdomain it is served on and 404s — is in that function's docstring
    now, next to the parameter it explains.

    Every author goes in it, including a row still flagged `provisional`.
    Nothing here has ever filtered on the flag, so the thirty-six placeholders
    have been named as `@type: Person` in the markup of 394 guides the whole
    time. Leaving it that way is the smaller of two wrongs: dropping the author
    silently removes a real contributor's credit the moment somebody forgets to
    untick a box, which is the exact failure that made `noindex` a separate
    switch from `provisional`. What the flag does instead is mark the profile
    this `url` points at, so a crawler that follows the author link lands on a
    page that says the name is a placeholder. If a real name is wanted here and
    nowhere else, the fix is to finish the roster, not to hide it.
  */
  const articleLd = article(doc, {
    description: clamp(doc.seo?.description || doc.summary || ''),
    url: canonical,
    author: person ? { name: person.name, url: hub(`/authors/${person.slug}`) } : null,
  })

  /*
    The reading estimate, as a node or as nothing.

    `readingMinutes` returns 0 for a guide with no body, and "0 min read" on a
    guide that is a lead image and a heading would be a figure about nothing.
    Blank is the answer, as it is everywhere else on this page.
  */
  const readTime =
    minutes > 0 ? (
      <span className="byline-read">{fill(ui.t('article.reading-time'), { count: minutes })}</span>
    ) : null

  return (
    <>
      <JsonLd data={articleLd} />
      {/*
        One grid, and it owns the headline as well as the body.

        This route used to render `PageHeader` — which wraps itself in its own
        `.page`, capped at `--page` (1340px) and centred — and then a *second*
        centred container for the article, capped at about 978px. Two centred
        boxes of different widths inside the same column: the `<h1>` started
        roughly 180px to the left of the first sentence under it, the lede ran
        to a different right edge from the prose, and the hairline under the
        header spanned a width nothing else on the page used. Nothing errored
        and no check had an opinion, because both halves were individually
        correct.

        So the header is a child of the article grid rather than a sibling of
        it, spanning both columns above the body and the rail. Everything on
        the page now resolves its left edge from one container. Do not put a
        second `.page` back in front of this one.

        `.article`, not `.split`: fifteen other detail routes share `.split`
        (1.4fr / 1fr), which on a wide screen is a 540px sidebar beside a 760px
        article. An article wants a measure and a rail. The arithmetic is in
        the `.article` section of globals.css.
      */}
      <div className="page article">
        <header className="article-head">
          <ol className="breadcrumbs">
            {[
              { label: 'Home', href: '/' },
              { label: 'Guides', href: '/guides' },
              { label: doc.title },
            ].map((crumb, index, all) => (
              <li key={crumb.label}>
                {crumb.href ? <Link href={crumb.href}>{crumb.label}</Link> : crumb.label}
                {index < all.length - 1 ? <span aria-hidden="true"> / </span> : null}
              </li>
            ))}
          </ol>

          {/*
            The kicker: what kind of page this is, and how far it can be
            trusted, on one line above the headline. `PageHeader` puts the
            badges in a row *under* the lede, which on an article separates the
            confidence rating from the thing it rates by four lines of prose.
          */}
          <div className="article-kicker">
            <p className="eyebrow">Guide</p>
            <Confidence level={doc.confidence} />
          </div>

          <h1 className="article-title">{doc.title}</h1>
          {doc.subtitle ? <p className="page-subtitle">{doc.subtitle}</p> : null}
          {doc.summary ? (
            <p className="lede">
              <Linked text={doc.summary} scope={scope} />
            </p>
          ) : null}

          {/*
            One row under the headline: who wrote it, what they do, when it was
            last checked, how long it is, and where to send it.

            Fextralife splits these into an author block and a separate strip of
            actions. One row is fewer rules across the page and reads as a
            single answer to "what is this and who stands behind it".

            No portrait. `Byline` can print one and every other caller of it is
            welcome to; on the masthead of an article it is a 34px circle of
            somebody's monogram competing with the headline, and the owner
            asked for it gone. It is `avatar` on the component rather than a
            deletion, because the avatar is real data and a profile page is
            entitled to it.
          */}
          <Byline
            author={doc.author}
            published={dates.published}
            updated={dates.updated}
            checkedBasis={dates.basis}
            bio
          >
            {readTime}
            {canonical ? <ShareRow url={canonical} title={doc.title} /> : null}
          </Byline>
        </header>

        <div className="article-body">
          {/*
            The lead image, at the full width of the body column.

            It used to be `EntityImage shape="wide"`, which caps at 640px — a
            record-page shape, sized for a figure sitting beside a fact panel.
            In a 940px article column that is a picture floating in the middle
            of the page with 300px of nothing to the right of it, which is half
            of what "our page is all broken" was about. An article's lead image
            is the width of the article.

            `hero` (1600x900) rather than `card` (768x432): this box is up to
            940px wide on a desktop and the card size would be upscaled.
            `fetchPriority` rather than `loading="lazy"` for the reason
            `EntityImage` documents — this is the LCP element by definition.

            Rendered here rather than through `EntityImage` so that component
            keeps exactly the three record shapes fifteen other routes rely on.
          */}
          {lead ? (
            <figure className="article-lead">
              <img
                src={lead.sizes?.hero?.url ?? lead.url ?? ''}
                alt={lead.alt ?? ''}
                width={lead.sizes?.hero?.width ?? lead.width ?? undefined}
                height={lead.sizes?.hero?.height ?? lead.height ?? undefined}
                fetchPriority="high"
                decoding="async"
              />
              <ImageCredit credit={lead.credit} slot="wide" />
            </figure>
          ) : null}

          {/*
            Blank on every guide until an editor writes one, and blank prints
            nothing at all. Never derived from the body — see `Takeaways`.
          */}
          <Takeaways points={doc.takeaways} scope={scope} />

          {/* Nothing at all under three headings. See `Contents`. */}
          <Contents headings={headings} />

          {/*
            `headingIds` is what makes the block above work: it stamps each h2
            and h3 with the id `articleHeadings` derived from the same words.
            Take it off and the contents list still renders, still looks right,
            and every link in it scrolls nowhere.
          */}
          {/*
            The body, with its pictures between its sections.

            They used to be a `<section>` of their own underneath all of it,
            under the heading "What you are looking for" — a gallery, reached
            after the reader had finished reading. `interleave` hands them to
            the renderer, which cuts the body at its own h2s and places them at
            the breaks, which is where a magazine puts a picture and what
            somebody comparing this to CBR is comparing it to.

            It has to be one `LinkedRichText` call and not three: the
            autolinker links a name once per element and the heading counter
            numbers ids across one document, so three calls would link the same
            entity three times and hand two sections the same anchor. The
            component splits the data internally and shares both maps — see the
            note on `interleave`.
          */}
          <LinkedRichText
            data={doc.body}
            scope={scope}
            headingIds
            interleave={bodyImages.map((entry) => (
              <figure className="article-figure" key={entry.id}>
                {/*
                  A wrapper, because the credit goes *in* the picture and the
                  caption goes under it. A `<figcaption>` has to be a direct
                  child of its `<figure>`, and this one already has the
                  editor's caption in that slot.
                */}
                <span className="figureshot">
                  <img
                    src={entry.media.sizes?.hero?.url ?? entry.media.url ?? ''}
                    alt={entry.caption ?? entry.media.alt ?? ''}
                    width={entry.media.sizes?.hero?.width ?? entry.media.width ?? undefined}
                    height={entry.media.sizes?.hero?.height ?? entry.media.height ?? undefined}
                    loading="lazy"
                    decoding="async"
                  />
                  <ImageCredit credit={entry.media.credit} slot="wide" as="p" />
                </span>
                {entry.caption ? <figcaption>{entry.caption}</figcaption> : null}
              </figure>
            ))}
          />

          {/*
            The fair-dealing line, once, under the article.

            It used to sit under the gallery this replaced. With image credits
            on, every frame already names the developer and the publisher
            inside itself and this would be the same sentence again; with them
            off it is the only credit the pictures have, and it is not the
            optional CC attribution but the line that stands behind using
            somebody's screenshot at all. So it follows the switch rather than
            being deleted along with the gallery.
          */}
          {bodyImages.length > 0 && credit && !creditsInPicture ? (
            <p className="note">{credit}</p>
          ) : null}

          {/*
            The row that closes the article: share it again, tell us it is
            wrong, or go back to the index.

            Fextralife's `.w-sharing-bottom` in shape — hairline above and
            below, actions spread across it — and deliberately not in content:
            theirs carries a like count, a follow button and an ad slot. The
            corrections link is the one this site owes a reader, because the
            caveat two blocks down has been promising a review queue since the
            day it was written.
          */}
          <div className="article-foot">
            {canonical ? <ShareRow url={canonical} title={doc.title} tone="foot" /> : null}
            <span className="article-foot-links">
              <Link href="/corrections">{ui.t('article.correction')}</Link>
              <Link href="/guides">{ui.t('article.all-guides')}</Link>
            </span>
          </div>

          {/*
            Provenance, as one block at the foot rather than four things
            scattered down the page.

            The citations used to sit here on their own under a caveat with no
            heading — the footnote nobody reads — while the only other thing a
            reader could use to place the article was a name at the top. Dates,
            byline, fact-check statement and sources now read as one answer to
            "who says so, and when".

            `Sources` is passed through unchanged, so Site settings → Content
            still decides whether the citation list prints. **It is off
            today**, which means every guide on the network shows the caveat and
            no citations; that is the owner's switch and not this route's to
            override. See the note in `src/components/Sources.tsx` about the two
            hosts that do carry a named exception, and why this is not a third
            one.
          */}
          <ArticleMeta
            published={dates.published}
            updated={dates.updated}
            checkedBasis={dates.basis}
            author={doc.author}
            review={doc.review}
          >
            <Sources sources={doc.sources} />
            <Attribution sources={doc.sources} />
          </ArticleMeta>

          <SectionNeighbours collection="guides" game={game} slug={slug} label="guides" />
          <CommentThread game={game} path={`/guides/${slug}`} />
        </div>

        {/*
          The rail, and what it is for.

          It carries what a reader of *this particular guide* wants next: the
          records it is about, the tools that answer the same question with
          their own run in it, and the rest of the series. Three blocks, in the
          order somebody actually needs them, at 300px rather than at half the
          window.

          What it deliberately does not carry is a second copy of the
          provenance. "Published / Last checked / Written by" is in
          `ArticleMeta` at the foot of the article and nowhere else — two
          implementations of one finding is the failure the audit section of
          CLAUDE.md records, and a sidebar "At a glance" restating the same
          dates from its own reads is exactly that shape.

          It is sticky on a wide screen and stacks after the article on a narrow
          one, which is also why the contents list is not in here: on a phone
          this column sits *below* the body it would be indexing.
        */}
        <aside className="article-rail">
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

          {/*
            The rest of the series, with the picture each one already has.

            Not `RelatedList`: that renders a title and an optional line of
            text, which is right for the twelve record routes that use it and
            is the whole of why this rail read as a list of blue words. A guide
            is an article and an article is sold by its picture — which the
            guides index already knew, because `.guidetile` there has carried
            one all along. This is that tile at rail width.

            `alt=""`: the picture is decoration beside a link that already says
            where it goes, so announcing it twice is noise. Uncredited for the
            same reason the index tiles are — a 96px thumbnail cannot carry a
            rightsholder line without hiding it, and hiding it is the one thing
            `ImageCredit` refuses to do. The credit is on the guide's own page,
            one click away, where the picture is large enough to read it.
          */}
          {more.length > 0 ? (
            <section className="section">
              <div className="section-head">
                <h2>
                  <Icon name="book" size={17} className="ic" />
                  More guides
                </h2>
                <span className="metarow">
                  <span className="eyebrow">{more.length}</span>
                  <Link href="/guides" className="cta">
                    {ui.t('related.see-all')}
                  </Link>
                </span>
              </div>
              <ul className="railguides">
                {more.map((item) => (
                  <li key={item.id}>
                    <Link className="railguide" href={item.href}>
                      {item.thumb ? (
                        <img
                          className="railguide-shot"
                          src={item.thumb}
                          alt=""
                          width={96}
                          height={54}
                          loading="lazy"
                          decoding="async"
                        />
                      ) : null}
                      <span className="railguide-title">{item.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>
    </>
  )
}
