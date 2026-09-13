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

export const videoGame = (base: string) => ({
  '@context': 'https://schema.org',
  '@type': 'VideoGame',
  name: 'The Blood of Dawnwalker',
  url: base,
  gamePlatform: ['PC', 'PlayStation 5', 'Xbox Series X|S'],
  applicationCategory: 'Game',
  genre: ['Action role-playing game', 'Dark fantasy'],
  publisher: { '@type': 'Organization', name: 'Bandai Namco Entertainment' },
  author: { '@type': 'Organization', name: 'Rebel Wolves' },
  datePublished: '2026-09-03',
})

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
