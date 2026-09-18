import type { Metadata, ResolvingMetadata } from 'next'
import type { ReactNode } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { Linked } from '@/components/Linked'
import type { LinkScope } from '@/lib/link-index'
import { JsonLd } from '@/components/JsonLd'
import { itemList, webSite } from '@/lib/schema'
import { COMPANIES_ORIGIN, companyUrl } from '@/lib/urls'
import { EntityCard } from '@/components/EntityCard'
import { Badge, Confidence } from '@/components/Badges'
import { client } from '@/lib/payload'
import { copy, pick, splitTokens } from '@/lib/copy'
import {
  COMPANIES_BUILT_IN,
  COMPANY_ROLE_LABEL,
  EMPHASISED_CLAUSE,
  getCompaniesSite,
} from '@/lib/companies-copy'
import { hub } from '@/lib/urls'
import type { Company, Game } from '@/payload-types'
import { socialMeta } from '@/lib/social'

/*
  Where this page is, for the inline linker.

  No `game`, because this host is not a wiki: the index holds the people,
  companies and games every host can link to and none of the game-scoped
  records. No `self` either — a directory is not a record, so there is
  nothing on it for a name to link back to.
*/
const LEDE_SCOPE: LinkScope = { host: 'companies' }

/**
 * Metadata reads the global, so it cannot be a module-level constant: the title
 * and the description on this page are editable like everything else, and a
 * `const metadata` is evaluated once at import with no way to await a read.
 */
export async function generateMetadata(
  _props: unknown,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const site = await getCompaniesSite()
  return {
    title: { absolute: copy(site.title, COMPANIES_BUILT_IN.title) },
    description: copy(site.metaDescription, COMPANIES_BUILT_IN.metaDescription),
    alternates: { canonical: '/' },
    ...(await socialMeta(parent, { path: '/' })),
  }
}

const rel = (value: unknown): Game | null =>
  value && typeof value === 'object' ? (value as Game) : null

/**
 * The role badges, or nothing at all.
 *
 * `role` used to default to `['developer']`, so every card on this page said
 * Developer whether a source did or not. With the default gone most companies
 * have no role, and a `<></>` passed as `badges` is truthy — it renders an
 * empty badge row under the summary, which is a gap where a fact used to be.
 * Undefined is what the card takes to mean "no badges".
 */
const roleBadges = (company: Company, extra?: ReactNode): ReactNode | undefined => {
  const roles = company.role ?? []
  if (roles.length === 0 && !extra) return undefined
  return (
    <>
      {roles.map((role) => (
        <Badge key={role}>{COMPANY_ROLE_LABEL[role] ?? role}</Badge>
      ))}
      {extra}
    </>
  )
}

const logoOf = (company: Company): { url?: string | null; alt?: string | null } | null =>
  company.logo && typeof company.logo === 'object'
    ? (company.logo as { url?: string | null; alt?: string | null })
    : null

/** A section note, or nothing at all when neither the editor nor the code has one. */
function Note({ text }: { text?: string | null }) {
  const value = (text ?? '').trim()
  if (!value) return null
  const at = value.indexOf(EMPHASISED_CLAUSE)
  if (at < 0) return <p className="note">{value}</p>
  return (
    <p className="note">
      {value.slice(0, at)}
      <strong>{EMPHASISED_CLAUSE}</strong>
      {value.slice(at + EMPHASISED_CLAUSE.length)}
    </p>
  )
}

/**
 * The callout body, with `{authorsLink}` as a real anchor.
 *
 * Parts, not markup: the alternative is an admin-editable string reaching the
 * DOM through `dangerouslySetInnerHTML`, which is a stored-XSS hole waiting for
 * the first editor account that should not have had one. An unknown token is
 * left visible — a typo somebody fixes in a minute beats a silent gap.
 */
function whyBodyNodes(text: string): ReactNode[] {
  return splitTokens(text).map((part, index) => {
    if (!('token' in part)) return <span key={index}>{part.text}</span>
    if (part.token === 'authorsLink') {
      return (
        <a key={index} href={hub('/authors')}>
          contributors
        </a>
      )
    }
    return <span key={index}>{`{${part.token}}`}</span>
  })
}

export default async function CompaniesIndex() {
  const payload = await client()
  const [{ docs }, site] = await Promise.all([
    payload.find({
      collection: 'companies',
      limit: 500,
      depth: 1,
      sort: 'name',
    }),
    getCompaniesSite(),
  ])
  const companies = docs as Company[]
  const groups = site.groups ?? {}

  /*
    Companies whose games we cover first, then the rest. A reader arriving
    here wants Capcom and The Coalition, not an alphabetical list in which the
    studios with a game on the network are scattered between studios that are
    only named in a franchise wiki's history.
  */
  const withGames = companies.filter((company) => (company.games ?? []).length > 0)
  const rest = companies.filter((company) => (company.games ?? []).length === 0)
  const ranked = rest.filter((company) => company.basis === 'revenue-ranking')
  const catalogued = rest.filter((company) => company.basis === 'gaming-category')
  /*
    Everything else, so nobody falls through. The first version grouped on
    three bases and there were four, which quietly hid a hundred and
    ninety-nine companies that were in the database and on the sitemap but on
    no page a reader could reach.
  */
  const mentioned = rest.filter(
    (company) => !['revenue-ranking', 'gaming-category'].includes(String(company.basis)),
  )

  return (
    <>
      <JsonLd
        data={webSite(COMPANIES_ORIGIN, {
          name: copy(site.title, COMPANIES_BUILT_IN.title),
          description: copy(site.metaDescription, COMPANIES_BUILT_IN.metaDescription),
        })}
      />
      <JsonLd
        data={itemList(
          COMPANIES_ORIGIN,
          companies.map((company) => ({
            name: company.name,
            url: companyUrl(`/${company.slug}`),
          })),
          { name: copy(site.title, COMPANIES_BUILT_IN.title) },
        )}
      />
      <PageHeader
        eyebrow={copy(site.eyebrow, COMPANIES_BUILT_IN.eyebrow)}
        crumbs={[{ label: 'Companies' }]}
        icon="person"
        title={copy(site.title, COMPANIES_BUILT_IN.title)}
        /* The count is filled at render time: a typed-in total is a sentence
           that goes wrong the week somebody harvests another parent company. */
        lede={<Linked text={copy(site.lede, COMPANIES_BUILT_IN.lede, { count: companies.length })} scope={LEDE_SCOPE} />}
      />
      <div className="page body-main">
        <section className="section">
          <div className="section-head">
            <h2>{copy(groups.coveredHeading, COMPANIES_BUILT_IN.groups.coveredHeading)}</h2>
          </div>
          {/* No note shipped with this section, so there is one only if an
              editor writes one. */}
          <Note text={groups.coveredNote} />
          <div className="grid">
            {withGames.map((company) => {
              const games = (company.games ?? []).map(rel).filter(Boolean) as Game[]
              return (
                <EntityCard
                  key={company.id}
                  href={`/${company.slug}`}
                  title={company.name}
                  summary={company.summary}
                  image={logoOf(company)}
                  thumbFit="contain"
                  badges={roleBadges(
                    company,
                    games.length > 0 ? <Badge key="here">{games.length} here</Badge> : null,
                  )}
                />
              )
            })}
          </div>
        </section>

        {ranked.length > 0 ? (
          <section className="section">
            <div className="section-head">
              <h2>{copy(groups.rankedHeading, COMPANIES_BUILT_IN.groups.rankedHeading)}</h2>
            </div>
            <Note text={pick(groups.rankedNote, COMPANIES_BUILT_IN.groups.rankedNote)} />
            <div className="grid">
              {ranked.map((company) => (
                <EntityCard
                  key={company.id}
                  href={`/${company.slug}`}
                  title={company.name}
                  summary={company.summary}
                  image={logoOf(company)}
                  thumbFit="contain"
                  badges={roleBadges(company)}
                />
              ))}
            </div>
          </section>
        ) : null}

        {catalogued.length > 0 ? (
          <section className="section">
            <div className="section-head">
              <h2>{copy(groups.cataloguedHeading, COMPANIES_BUILT_IN.groups.cataloguedHeading)}</h2>
            </div>
            <Note text={pick(groups.cataloguedNote, COMPANIES_BUILT_IN.groups.cataloguedNote)} />
            <div className="grid">
              {catalogued.map((company) => (
                <EntityCard
                  key={company.id}
                  href={`/${company.slug}`}
                  title={company.name}
                  summary={company.summary}
                  image={logoOf(company)}
                  thumbFit="contain"
                  badges={roleBadges(company)}
                />
              ))}
            </div>
          </section>
        ) : null}

        {mentioned.length > 0 ? (
          <section className="section">
            <div className="section-head">
              <h2>{copy(groups.mentionedHeading, COMPANIES_BUILT_IN.groups.mentionedHeading)}</h2>
            </div>
            <Note text={pick(groups.mentionedNote, COMPANIES_BUILT_IN.groups.mentionedNote)} />
            <div className="grid">
              {mentioned.map((company) => (
                <EntityCard
                  key={company.id}
                  href={`/${company.slug}`}
                  title={company.name}
                  summary={company.summary}
                  image={logoOf(company)}
                  thumbFit="contain"
                  badges={<Confidence level={company.confidence} />}
                />
              ))}
            </div>
          </section>
        ) : null}

        <div className="callout">
          <h2>{copy(site.whyHeading, COMPANIES_BUILT_IN.whyHeading)}</h2>
          <p>{whyBodyNodes(copy(site.whyBody, COMPANIES_BUILT_IN.whyBody))}</p>
        </div>
      </div>
    </>
  )
}
