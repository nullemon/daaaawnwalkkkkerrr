import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { client, getAll, getGame, gameUrl, siteUrl } from '@/lib/payload'
import { SECTIONS, toolsFor } from '@/lib/sections'
import { NETWORK_SUBDOMAINS, subdomainOf } from '@/proxy'
import { COMPANIES_ORIGIN, PEOPLE_ORIGIN, companyUrl, personUrl } from '@/lib/urls'
import { GENERATED_ART, imagesFor, type SitemapMedia } from '@/lib/sitemap-images'

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
 * **`lastmod` is the one engines actually use**, and it is a record's own
 * `updatedAt` rather than the time the file was generated. An index page has
 * no `updatedAt` of its own, so it carries the request time — which is honest
 * for a page composed from records that change, and is the only place a
 * generated timestamp appears.
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
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const network = await siteUrl()
  const host = (await headers()).get('host') ?? new URL(network).host
  const label = subdomainOf(host, new URL(network).host)

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
  if (!label) return hubSitemap(network)
  if (label === 'companies') return companiesSitemap()
  if (label === 'people') return peopleSitemap()
  if (NETWORK_SUBDOMAINS.has(label)) {
    /*
      A network host somebody added to the router and not to this file. Better
      to serve the host's front page alone than to serve nothing at all and
      look like a site with no pages.
    */
    return [{ url: `https://${host}`, lastModified: new Date(), priority: 1 }]
  }
  return wikiSitemap(label)
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
        lastModified: company.updatedAt ? new Date(company.updatedAt) : now,
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
        lastModified: person.updatedAt ? new Date(person.updatedAt) : now,
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
  type Listed = { slug: string; updatedAt?: string | null } & Record<string, unknown>
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
    // The index only earns a place once it has something on it.
    entries.push({
      url: `${base}${section.href}`,
      lastModified: now,
      priority: Math.min(section.priority + 0.1, 1),
    })

    for (const record of docs) {
      const id = art ? uploadId(record[section.imageField]) : null
      entries.push({
        url: `${base}${section.href}/${record.slug}`,
        lastModified: record.updatedAt ? new Date(record.updatedAt) : now,
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
