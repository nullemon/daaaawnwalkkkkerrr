import type { Metadata, ResolvingMetadata } from 'next'
import { PageHeader } from '@/components/PageHeader'
import { Linked } from '@/components/Linked'
import type { LinkScope } from '@/lib/link-index'
import { sectionArt } from '@/lib/art'
import { DataTable, type Row } from '@/components/DataTable'
import { roleLabel } from '@/lib/characters'
import { getUi } from '@/lib/ui'
import { getAll, getGame } from '@/lib/payload'
import { sectionCopy } from '@/lib/section-copy'
import type { Character, Media } from '@/payload-types'
import { socialMeta } from '@/lib/social'

type Props = { params: Promise<{ game: string }> }

export async function generateMetadata(
  { params }: Props,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const { game: slug } = await params
  const [game, characters] = await Promise.all([
    getGame(slug),
    getAll('characters', { game: slug, depth: 0 }),
  ])
  const copy = sectionCopy('characters', game, { total: characters.length })
  return {
    title: copy.title,
    description: copy.description,
    alternates: { canonical: '/characters' },
    ...(await socialMeta(parent, { path: '/characters' })),
  }
}

// `typeof null === 'object'`, so an unset portrait passes a bare typeof test
// and every character counts as illustrated. Check the value first.
const asMedia = (value: Character['portrait']): Media | null =>
  value && typeof value === 'object' ? (value as Media) : null

export default async function CharactersIndex({ params }: Props) {
  const { game: slug } = await params
  const [game, characters, ui] = await Promise.all([
    getGame(slug),
    getAll('characters', { game: slug, depth: 1 }),
    getUi(),
  ])

  const withPortrait = characters.filter((character) => asMedia(character.portrait))
  const copy = sectionCopy('characters', game, {
    total: characters.length,
    detail: withPortrait.length,
  })

  const rows: Row[] = characters.map((character) => {
    const portrait = asMedia(character.portrait)
    // The square thumb, not the 810x1080 original — this is a 22px avatar and
    // the full portrait is a hundred times the pixels it needs.
    const thumb = portrait?.sizes?.thumb?.url ?? portrait?.url ?? undefined
    return {
      id: character.id,
      avatar: thumb ?? undefined,
      icon: 'person',
      title: character.title,
      titleHref: `/characters/${character.slug}`,
      role: roleLabel(character.role, ui) ?? '',
      romance: character.romanceable ? 'Romanceable' : '',
      summary: character.summary ?? '',
    }
  })

  /*
    Where this page is, for the inline linker.

    No `self`: an index is about a section rather than about one record, so
    there is nothing on it to link to itself. The wiki's own game is still
    treated as self by `matchText`, which is what keeps a lede naming the game
    from linking to the home page the reader is already inside.
  */
  const scope: LinkScope = { host: 'wiki', game: slug }

  return (
    <>
      <PageHeader
        art={sectionArt(slug, 'characters')}
        eyebrow="Database"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Characters' }]}
        icon="person"
        title={copy.heading}
        lede={copy.lede ? <Linked text={copy.lede} scope={scope} /> : undefined}
      />
      <div className="page body-main">
        <DataTable
          rows={rows}
          noun="characters"
          searchPlaceholder={`Search ${characters.length} characters by name or role…`}
          facets={[
            { key: 'role', label: 'Role' },
            { key: 'romance', label: 'Romance' },
          ]}
          columns={[
            { key: 'title', label: 'Character', type: 'name' },
            { key: 'role', label: 'Role' },
            { key: 'romance', label: 'Romance' },
            { key: 'summary', label: 'Summary', sortable: false },
          ]}
        />
      </div>
    </>
  )
}
