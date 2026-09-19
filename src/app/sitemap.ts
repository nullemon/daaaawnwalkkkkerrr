import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { client, getAll, getGame, gameUrl, siteUrl } from '@/lib/payload'
import { SECTIONS, toolsFor } from '@/lib/sections'
import { NETWORK_SUBDOMAINS, subdomainOf } from '@/proxy'
import { COMPANIES_ORIGIN, PEOPLE_ORIGIN, companyUrl, personUrl } from '@/lib/urls'
import { GENERATED_ART, imagesFor, type SitemapMedia } from '@/lib/sitemap-images'
import { guideLastModified, sourcesLastRead } from '@/lib/guide-dates'
import { demoDatesOn, lastmodFor } from '@/lib/sitemap-dates'

/**
 * The sitemap, answered per host.
 *
 * Every wiki is its own origin, so each needs its own sitemap listing only its
 * own URLs. One file listing seven hosts would be a cross-host sitemap, which
 * engines only honour when all of them are verified under a single property —
 * not something to depend on.
 *
 * ## Why one route rather than one per game
 *
 * The obvious shape is a route handler at `[game]/sitemap.xml/route.ts`, so
 * each wiki's sitemap prerenders with its pages. That does not work: `sitemap`
 * is one of Next's metadata file conventions, and a route folder named
 * `sitemap.xml` is claimed by it. The result builds without complaint and
 * emits a single file at the literal path `/-/sitemap.xml` — the dash being
 * the placeholder for the `id` that `generateSitemaps` would have supplied —
 * while `/dawnwalker/sitemap.xml` does not exist at all.
 *
 * So this reads the Host header instead, exactly as `robots.ts` does, and
 * decides which sitemap it is. That makes it dynamic, which is the one
 * exception to the site being wholly prerendered, and is worth it: a sitemap
 * is fetched a few times a day by crawlers and never by a reader.
 *
 * ## What each entry carries
 *
 * `<loc>`, `<lastmod>`, `<priority>` and, where the page has one, an
 * `<image:image>`. Three of those need a word of explanation.
 *
 * **`lastmod` is the one engines actually use**, and it is a record's own date
 * rather than the time the file was generated. For a guide that is
 * `guideLastModified` — the day this page's own citations were read, off a
 * committed harvest file — and where there is no such date the element is
 * omitted rather than filled in, because Google stops trusting a `lastmod`
 * that is obviously synthetic and a row timestamp on four hundred pages is
 * exactly that. See `src/lib/guide-dates.ts`.
 *
 * **Every other record answers the same way**, and the sentence that used to
 * sit here is worth keeping as a warning: "every other collection carries its
 * `updatedAt`, which has the same weakness and, so far, no better answer."
 * There was a better answer, in the column the guides were already reading.
 * `src/seed/import.ts` refuses a record with no source, and every source
 * carries the day it was read — all 2,000 game-scoped records here have one,
 * spread over four real days, and so do 318 of 321 companies and all 597
 * people. So 1,590 record pages were declaring a date that was the same on
 * every one of them and different after every rebuild, which is the exact
 * synthetic `lastmod` the guide rule exists to avoid, on four times as many
 * pages as the rule covered.
 *
 * A record with no dated citation carries no `lastmod` at all. "Unknown" is a
 * legal answer in a sitemap and a true one.
 *
 * **An index page takes the newest date of the records on it.** It used to
 * take the request time, on the argument that a page composed from records
 * that change has no date of its own — which is half right and produced the
 * same defect one level up: sixteen index pages per wiki, all stamped with the
 * minute the file was generated, moving on every fetch. The records are
 * already in hand when the index entry is written, so the honest date is free.
 * The three or four pages that genuinely have no underlying record — the hub
 * home, the legal pages — are the only generated timestamps left, and they are
 * the only ones the argument was ever true for.
 *
 * **`changefreq` is gone.** Google states outright that it ignores it, Bing
 * has said the same, and Yandex treats it as a weak hint — so the most it
 * could ever buy is nothing. What it cost was worse than nothing: every
 * record page declared `weekly` while the `lastmod` two lines below said the
 * record had not been touched in a year, which is a sitemap contradicting
 * itself about the one field a crawler does read. Nothing here can source a
 * claim about how often a page will change in future, and "unknown is not
 * zero" applies to a guess dressed as a schedule as much as to a segment cost.
 *
 * **`priority` stays**, and is the narrower case. It is ignored by Google too,
 * but it is not a claim about the world — it is this site ranking its own
 * pages against each other, the numbers are already on `SECTIONS` and doing
 * editorial work there, and a relative ordering of our own URLs is something
 * we can actually state. It costs about twenty bytes a URL against a 50MB
 * limit the largest host uses under half a percent of.
 *
 * ## Size
 *
 * The limits are 50,000 URLs and 50MB per file. Across all ten hosts this
 * network serves 3,082 URLs; the largest single one is Star Wars Zero Company
 * at 788 URLs and 203KB. A sitemap index would be machinery guarding against
 * a number nearly two orders of magnitude away. Revisit at, say, 20,000 URLs
 * on one host — `generateSitemaps` is the answer then, and the note above
 * about the route-folder name is the thing to re-read first.
 */
/**
 * Demo mode, applied in exactly one place.
 *
 * Every entry in this file already computes the honest answer — a record's own
 * citation date, or nothing where it has none. This is the only thing that
 * ever overrides one, and it overrides all of them or none, which is the whole
 * reason it is a pass over the finished array rather than an argument threaded
 * through fifteen call sites. A spread that reached most entries and missed
 * three would be worse than either state: a sitemap where three pages are
 * visibly the odd ones out.
 *
 * `src/lib/sitemap-dates.ts` says what it does and what it costs.
 */
const applyDemoDates = (entries: MetadataRoute.Sitemap, now: Date): MetadataRoute.Sitemap => {
  if (!demoDatesOn()) return entries
  return entries.map((entry) => {
    const lastModified = lastmodFor(entry.url, entry.lastModified, now)
    return lastModified ? { ...entry, lastModified } : entry
  })
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const network = await siteUrl()
  const host = (await headers()).get('host') ?? new URL(network).host
  const label = subdomainOf(host, new URL(network).host)
  const now = new Date()

  /*
    Not every subdomain is a wiki.

    `subdomainOf` returns a label and this handed every one of them to
    `wikiSitemap`, which asks `getGame(label)` and gets null for `companies` —
    so it returned `[]`, and `companies.<domain>/sitemap.xml` has been a valid,
    well-formed, completely empty sitemap since the host shipped. Three hundred
    and twenty company profiles, none of them listed anywhere a crawler reads.
    Nothing errored: an empty sitemap is not a malformed one, and the only way
    to notice was to open the URL.

    The `people` host would have launched with exactly the same hole, which is
    why it is worth branching on the list the router already keeps rather than
    on the two names.
  */
  if (!label) return applyDemoDates(await hubSitemap(network), now)
  if (label === 'companies') return applyDemoDates(await companiesSitemap(), now)
  if (label === 'people') return applyDemoDates(await peopleSitemap(), now)
  if (NETWORK_SUBDOMAINS.has(label)) {
    /*
      A network host somebody added to the router and not to this file. Better
      to serve the host's front page alone than to serve nothing at all and
      look like a site with no pages.
    */
    return applyDemoDates([{ url: `https://${host}`, lastModified: now, priority: 1 }], now)
  }
  return applyDemoDates(await wikiSitemap(label), now)
}

/**
 * Two things a record can say that keep it out of every sitemap on this site.
 *
 * `seo.noindex` is the editor's "hide this page from search engines" checkbox.
 * It reached the page's `<meta robots>` on all eighteen detail routes and
 * reached no sitemap but the apex's, so a ticked record was served `noindex`
 * *and* listed for crawling - the site telling a crawler to come and then not
 * to look, which is the same contradiction the comment on the author loop
 * below says is the reason that filter exists. Nothing is ticked today; this
 * is the guard for the first time somebody does.
 *
 * `_status` is the one that has already cost this project a day. `guides` is
 * the only collection with drafts, Payload defaults a created document to
 * `draft`, and a draft is a complete row that 404s - 335 of them shipped
 * counted, verified and broken. `publish-guides.ts` states in its own header
 * that "the page 404s, the sitemap omits it". The sitemap did not omit it:
 * nothing here has ever read `_status`. `pnpm verify` catches drafts now, but
 * a sitemap full of 404s is a crawl error against the whole host and is worth
 * a guard of its own rather than one check somebody has to remember to run.
 */
const hiddenFromSitemap = (record: unknown): boolean => {
  const doc = record as { seo?: { noindex?: boolean | null } | null; _status?: string | null }
  if (doc?.seo?.noindex) return true
  return Boolean(doc?._status) && doc._status !== 'published'
}

/**
 * Media documents for a set of upload ids, in one query.
 *
 * Every read in this file is `depth: 0`, which returns an upload field as a
 * bare id. The obvious fix is `depth: 1`, and it is the wrong one: that
 * populates *every* relationship on the record — a quest's region, its
 * prereqs, its excludes — across thirteen collections, to reach one filename.
 * That is the shape of read that made `next build` abort with SQLITE_BUSY at
 * page six hundred, and the reason `countRecords` exists. One extra query for
 * the whole host is cheaper than thirteen fatter ones.
 *
 * Chunked because the ids go into a SQL `IN` as bound parameters, and SQLite
 * has a ceiling on how many a statement may carry. A host with a thousand
 * pictures must not be the one that discovers where it is.
 */
const CHUNK = 400

const resolveMedia = async (ids: Set<number>): Promise<Map<number, SitemapMedia>> => {
  const found = new Map<number, SitemapMedia>()
  if (ids.size === 0) return found

  const payload = await client()
  const all = [...ids]
  for (let start = 0; start < all.length; start += CHUNK) {
    const batch = all.slice(start, start + CHUNK)
    const result = await payload.find({
      collection: 'media',
      where: { id: { in: batch } },
      limit: batch.length,
      pagination: false,
      depth: 0,
    })
    for (const doc of result.docs) found.set(doc.id as number, doc as SitemapMedia)
  }
  return found
}

/** The id in an upload field at `depth: 0`, or null when the field is empty. */
const uploadId = (value: unknown): number | null => {
  if (typeof value === 'number') return value
  // Belt and braces: a caller that raised the depth would hand us the object.
  if (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'number') {
    return (value as { id: number }).id
  }
  return null
}

/** Every company profile, on the companies host. */
async function companiesSitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()
  const payload = await client()
  const companies = await payload.find({ collection: 'companies', limit: 1000, depth: 0 })
  const listed = companies.docs.filter((company) => !hiddenFromSitemap(company))

  const media = await resolveMedia(
    new Set(listed.flatMap((company) => uploadId(company.logo) ?? [])),
  )

  return [
    { url: companyUrl('/'), lastModified: now, priority: 1 },
    ...listed.map((company) => {
      /*
        The profile renders `logo.url` — the stored original, no size — so
        that is what is listed. 118 of the 321 profiles have one: the harvester
        downloads a logo only where Commons states a licence that allows it,
        and the rest have an empty field, which `imagesFor` turns into no
        entry rather than a placeholder.

        `id === null` rather than a lookup on a sentinel id: a missing logo and
        a logo whose media row has been deleted are the same answer here, and
        neither should reach `media.get` pretending to be a number.
      */
      const id = uploadId(company.logo)
      return {
        url: companyUrl(`/${company.slug}`),
        /*
          The day this profile's own sources were read, the same as every
          record on a wiki. 318 of the 321 carry one; the three that do not
          carry no `lastmod` rather than the time this file was generated.
        */
        ...(sourcesLastRead(company.sources as Parameters<typeof sourcesLastRead>[0])
          ? {
              lastModified: new Date(
                sourcesLastRead(company.sources as Parameters<typeof sourcesLastRead>[0]) as string,
              ),
            }
          : {}),
        priority: 0.5,
        images: id === null ? undefined : imagesFor(COMPANIES_ORIGIN, media.get(id)),
      }
    }),
  ]
}

/** Every person profile, on the people host. */
async function peopleSitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()
  const payload = await client()
  const people = await payload.find({ collection: 'people', limit: 2000, depth: 0 })
  const listed = people.docs.filter((person) => !hiddenFromSitemap(person))

  const media = await resolveMedia(new Set(listed.flatMap((person) => uploadId(person.photo) ?? [])))

  return [
    { url: personUrl('/'), lastModified: now, priority: 1 },
    ...listed.map((person) => {
      /*
        `card`, because `PersonProfile` renders `sizes.card.url ?? url` and the
        sitemap has to name the URL the reader's browser was actually handed.
        Only 13 of the 597 profiles have a photograph — a freely licensed
        picture of a games developer is rare, and the panel says so in words
        rather than drawing a silhouette. The other 584 get no entry.
      */
      const id = uploadId(person.photo)
      return {
        url: personUrl(`/${person.slug}`),
        // As above. All 597 carry a dated citation.
        ...(sourcesLastRead(person.sources as Parameters<typeof sourcesLastRead>[0])
          ? {
              lastModified: new Date(
                sourcesLastRead(person.sources as Parameters<typeof sourcesLastRead>[0]) as string,
              ),
            }
          : {}),
        priority: 0.5,
        images: id === null ? undefined : imagesFor(PEOPLE_ORIGIN, media.get(id), 'card'),
      }
    }),
  ]
}

/** The apex: the directory, the contributor profiles, and the legal pages. */
async function hubSitemap(base: string): Promise<MetadataRoute.Sitemap> {
  const now = new Date()

  const entries: MetadataRoute.Sitemap = [
    { url: base, lastModified: now, priority: 1 },
    { url: `${base}/wikis`, lastModified: now, priority: 0.9 },
    { url: `${base}/authors`, lastModified: now, priority: 0.5 },
    { url: `${base}/contact`, lastModified: now, priority: 0.4 },
    { url: `${base}/privacy`, lastModified: now, priority: 0.3 },
    { url: `${base}/terms`, lastModified: now, priority: 0.3 },
  ]

  /*
    Contributor profiles, minus any explicitly hidden.

    This used to skip every profile still marked provisional, because the
    profile rendered `noindex` and listing a noindex page in a sitemap is a
    contradiction. Indexing no longer follows from that flag — it is its own
    checkbox — so the only reason to leave a profile out is somebody having
    ticked it.

    No `images`, and that is the editorial call rather than an oversight: the
    only picture on a contributor profile is the monogram `pnpm make:avatars`
    draws from their initials. See `GENERATED_ART`.
  */
  const authors = await getAll('authors', { depth: 0 })
  for (const author of authors) {
    if (author.noindex) continue
    entries.push({
      url: `${base}/authors/${author.slug}`,
      /*
        The one collection that keeps its row timestamp, and it is not an
        oversight. A contributor profile is not compiled from anything — all
        36 carry no sources at all, so there is no retrieval date to read —
        and `updatedAt` is the right answer the moment a real person edits
        their own bio. It is synthetic today only because `seed:contributors`
        rewrites the whole roster on every run, which stops being true when
        the placeholders are replaced. Worth re-reading then, not before.
      */
      lastModified: author.updatedAt ? new Date(author.updatedAt) : now,
      priority: 0.4,
    })
  }

  /*
    The hub home and `/wikis` carry no `<image:image>` either, though both
    show every wiki's key art. Each of those pictures already belongs to a
    page on the wiki that owns it, and listing it here as well would put two
    hosts forward for one image with the weaker of the two — a directory card
    — as the second claimant. One image, one canonical page.
  */
  return entries
}

/**
 * One wiki.
 *
 * The section list comes from `lib/sections.ts` rather than being restated
 * here. It used to be restated here, and in the search index, and in the
 * footer — lists that all had to be edited together and, predictably, were not.
 */
async function wikiSitemap(slug: string): Promise<MetadataRoute.Sitemap> {
  const game = await getGame(slug)
  if (!game) return []

  const base = await gameUrl(game)
  const now = new Date()

  /*
    The wiki home's own picture: the game's key art, exactly as the masthead
    renders it — `sizes.hero.url ?? url`, the 1600px crop.

    `getGame` reads at depth 1, so `theme.hero` arrives populated here and
    needs no lookup. Where a wiki has no hero the masthead falls back to a
    Dawnwalker press band via `sectionArt`, which belongs to one game and is
    decorative furniture on the only wiki allowed to show it; it is a CSS
    background rather than content, and no host lists it.
  */
  const heroImages = imagesFor(base, game.theme?.hero, 'hero')

  // Index pages, and the tools this game actually has. A wiki without a run
  // checker must not advertise one: a 404 in a sitemap is a crawl error
  // against the whole host, not a quietly ignored line.
  const entries: MetadataRoute.Sitemap = [
    { url: base, lastModified: now, priority: 1, images: heroImages },
    ...toolsFor(game).map((tool) => ({
      url: `${base}${tool.href}`,
      lastModified: now,
      priority: 0.9,
    })),
    { url: `${base}/about`, lastModified: now, priority: 0.4 },
  ]

  /*
    Two passes: read every section and collect the media ids, then resolve
    them all in one query. One lookup per section would double the number of
    queries this route makes for no gain, and this file is the one place on
    the site that reads sixteen collections in a row.

    The rows only need three things from here on, and the image field is named
    by a string, so they are handled as records rather than as sixteen
    different document types.
  */
  type Listed = { slug: string; sources?: { retrieved?: string | null }[] | null } & Record<
    string,
    unknown
  >
  const walked: { section: (typeof SECTIONS)[number]; docs: Listed[]; art: boolean }[] = []
  const mediaIds = new Set<number>()

  for (const section of SECTIONS) {
    const all = await getAll(section.collection, { game: slug, depth: 0 })
    const docs = all.filter((record) => !hiddenFromSitemap(record)) as unknown as Listed[]
    if (docs.length === 0) continue

    /*
      Six of the sixteen sections make no image claim, here and only here:
      their picture is an emblem this site generated, which depicts nothing on
      purpose. Their records keep their URL, their lastmod and their priority.
      See `GENERATED_ART`.
    */
    const art = !GENERATED_ART.has(section.collection)
    if (art) {
      for (const record of docs) {
        const id = uploadId(record[section.imageField])
        if (id !== null) mediaIds.add(id)
      }
    }
    walked.push({ section, docs, art })
  }

  const media = await resolveMedia(mediaIds)

  for (const { section, docs, art } of walked) {
    /*
      The index only earns a place once it has something on it — which is now
      also what the route itself says, since all sixteen `notFound()` on an
      empty collection.

      Its date is the newest of the records listed on it rather than the
      request time. An index has no date of its own, which was the argument for
      stamping it `now`; what an index *is* is the set of records under it, so
      the day the newest of them was last read is the day the page last said
      something different. The rows are already in hand.
    */
    const newest = docs
      .map((record) => sourcesLastRead(record.sources as Parameters<typeof sourcesLastRead>[0]))
      .filter((day): day is string => Boolean(day))
      .sort()
      .pop()

    entries.push({
      url: `${base}${section.href}`,
      ...(newest ? { lastModified: new Date(newest) } : {}),
      priority: Math.min(section.priority + 0.1, 1),
    })

    for (const record of docs) {
      const id = art ? uploadId(record[section.imageField]) : null
      /*
        `lastmod` for a guide is the guide's own date, not the row's.

        `updatedAt` is the same value on all 410 guides — the afternoon
        somebody last ran the seed — because every generator upserts every
        guide on every run. Four hundred articles across eight hosts all
        declaring the same modification date, and a different one after each
        rebuild, is the textbook synthetic `lastmod`: Google's stated position
        is that it stops trusting the field when it obviously is not real, and
        this field is the only one in a sitemap it reads at all.

        `guideLastModified` answers from the guide's own citations instead —
        the day the harvest it compiles was actually read, out of a committed
        file rather than off the clock. Where a guide has no honest date,
        `<lastmod>` is omitted: "unknown" is a legal answer in a sitemap and a
        true one, and it is the same "unknown is not zero" this repository
        applies to a segment cost.

        Every other collection answers from the same place, and for four
        times as many pages. `import.ts` refuses a record with no source and
        every source carries the day it was read, so a quest, a character or a
        region has exactly the honest date a guide has — it was simply never
        asked. `updatedAt` on 1,590 record pages was one value, identical
        across all of them and replaced on every rebuild.

        A guide still goes through `guideDates`, because it has two fields an
        editor can type into that outrank its citations. Nothing else has
        those, so nothing else needs the rest of that logic.
      */
      const lastmod =
        section.collection === 'guides'
          ? guideLastModified(record as Parameters<typeof guideLastModified>[0])
          : sourcesLastRead(record.sources as Parameters<typeof sourcesLastRead>[0])
      entries.push({
        url: `${base}${section.href}/${record.slug}`,
        ...(lastmod ? { lastModified: new Date(lastmod) } : {}),
        priority: section.priority,
        /*
          Every one of these routes renders the stored original rather than a
          generated size — fifteen through `EntityImage`, `maps` through
          `GameMap`, both reading `image.url` — so no size is named here.
        */
        images: id === null ? undefined : imagesFor(base, media.get(id)),
      })
    }
  }

  return entries
}
