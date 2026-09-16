/**
 * Structured data. Kept to the types Google actually uses for this kind of
 * site — the game entity, breadcrumbs, and step-by-step guides — rather than
 * every schema that technically validates.
 */

export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  )
}

/**
 * The game entity for a wiki.
 *
 * Every field was hardcoded to Dawnwalker's - down to a `datePublished` that
 * was not even Dawnwalker's - and the only reason that never reached a page is
 * that nothing calls this yet. Structured data is read by machines and not by
 * anybody proofreading, so wiring the old version up on eight wikis would have
 * told Google that Silent Hill: Townfall was authored by Rebel Wolves and
 * nobody would have noticed. It takes the game now, and omits what the record
 * does not have rather than filling it in.
 */
export const videoGame = (
  base: string,
  game: {
    title: string
    platforms?: { value?: string | null }[] | null
    developer?: string | null
    publisher?: string | null
    releaseDate?: string | null
    releaseDateConfirmed?: boolean | null
  },
) => {
  const platforms = (game.platforms ?? [])
    .map((platform) => platform?.value)
    .filter((value): value is string => Boolean(value))

  return {
    '@context': 'https://schema.org',
    '@type': 'VideoGame',
    name: game.title,
    url: base,
    ...(platforms.length > 0 ? { gamePlatform: platforms } : {}),
    applicationCategory: 'Game',
    ...(game.publisher
      ? { publisher: { '@type': 'Organization', name: game.publisher } }
      : {}),
    ...(game.developer ? { author: { '@type': 'Organization', name: game.developer } } : {}),
    // An announced window is not a publication date. Only a confirmed one is
    // a fact worth handing to a search engine as structured data.
    ...(game.releaseDate && game.releaseDateConfirmed
      ? { datePublished: game.releaseDate.slice(0, 10) }
      : {}),
  }
}

export const breadcrumbs = (base: string, crumbs: { label: string; href?: string }[]) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: crumbs.map((crumb, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name: crumb.label,
    ...(crumb.href ? { item: `${base}${crumb.href}` } : {}),
  })),
})
