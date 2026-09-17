import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { client, getAll, getGame, gameUrl, siteUrl } from '@/lib/payload'
import { SECTIONS, toolsFor } from '@/lib/sections'
import { NETWORK_SUBDOMAINS, subdomainOf } from '@/proxy'
import { companyUrl, personUrl } from '@/lib/urls'

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
    return [{ url: `https://${host}`, lastModified: new Date(), changeFrequency: 'weekly', priority: 1 }]
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

/** Every company profile, on the companies host. */
async function companiesSitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()
  const payload = await client()
  const companies = await payload.find({ collection: 'companies', limit: 1000, depth: 0 })
  return [
    { url: companyUrl('/'), lastModified: now, changeFrequency: 'weekly', priority: 1 },
    ...companies.docs
      .filter((company) => !hiddenFromSitemap(company))
      .map((company) => ({
        url: companyUrl(`/${company.slug}`),
        lastModified: company.updatedAt ? new Date(company.updatedAt) : now,
        changeFrequency: 'monthly' as const,
        priority: 0.5,
      })),
  ]
}

/** Every person profile, on the people host. */
async function peopleSitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()
  const payload = await client()
  const people = await payload.find({ collection: 'people', limit: 2000, depth: 0 })
  return [
    { url: personUrl('/'), lastModified: now, changeFrequency: 'weekly', priority: 1 },
    ...people.docs
      .filter((person) => !hiddenFromSitemap(person))
      .map((person) => ({
        url: personUrl(`/${person.slug}`),
        lastModified: person.updatedAt ? new Date(person.updatedAt) : now,
        changeFrequency: 'monthly' as const,
        priority: 0.5,
      })),
  ]
}

/** The apex: the directory, the contributor profiles, and the legal pages. */
async function hubSitemap(base: string): Promise<MetadataRoute.Sitemap> {
  const now = new Date()

  const entries: MetadataRoute.Sitemap = [
    { url: base, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/wikis`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${base}/authors`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${base}/contact`, lastModified: now, changeFrequency: 'yearly', priority: 0.4 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ]

  /*
    Contributor profiles, minus any explicitly hidden.

    This used to skip every profile still marked provisional, because the
    profile rendered `noindex` and listing a noindex page in a sitemap is a
    contradiction. Indexing no longer follows from that flag — it is its own
    checkbox — so the only reason to leave a profile out is somebody having
    ticked it.
  */
  const authors = await getAll('authors', { depth: 0 })
  for (const author of authors) {
    if (author.noindex) continue
    entries.push({
      url: `${base}/authors/${author.slug}`,
      lastModified: author.updatedAt ? new Date(author.updatedAt) : now,
      changeFrequency: 'monthly',
      priority: 0.4,
    })
  }

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

  // Index pages, and the tools this game actually has. A wiki without a run
  // checker must not advertise one: a 404 in a sitemap is a crawl error
  // against the whole host, not a quietly ignored line.
  const entries: MetadataRoute.Sitemap = [
    { url: base, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    ...toolsFor(game).map((tool) => ({
      url: `${base}${tool.href}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    })),
    { url: `${base}/about`, lastModified: now, changeFrequency: 'monthly' as const, priority: 0.4 },
  ]

  for (const section of SECTIONS) {
    const all = await getAll(section.collection, { game: slug, depth: 0 })
    const docs = all.filter((record) => !hiddenFromSitemap(record))
    if (docs.length === 0) continue

    // The index only earns a place once it has something on it.
    entries.push({
      url: `${base}${section.href}`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: Math.min(section.priority + 0.1, 1),
    })

    for (const record of docs) {
      entries.push({
        url: `${base}${section.href}/${record.slug}`,
        lastModified: record.updatedAt ? new Date(record.updatedAt) : now,
        changeFrequency: 'weekly',
        priority: section.priority,
      })
    }
  }

  return entries
}
