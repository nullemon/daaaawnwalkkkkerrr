import type { Metadata } from 'next'
import { PageHeader } from '@/components/PageHeader'
import { sectionArt } from '@/lib/art'
import { DataTable, type Row } from '@/components/DataTable'
import { getAll } from '@/lib/payload'
import type { Character, Media } from '@/payload-types'

export const metadata: Metadata = {
  title: 'Characters of Vale Sangora',
  description: 'Allies, vassals and antagonists in The Blood of Dawnwalker, and whose questline gates which ending.',
  alternates: { canonical: '/characters' },
}

const ROLE: Record<string, string> = {
  protagonist: 'Protagonist',
  ally: 'Ally',
  vassal: 'Vassal',
  antagonist: 'Antagonist',
  merchant: 'Merchant',
  minor: 'Minor',
}

export default async function CharactersIndex() {
  const characters = await getAll<Character>('characters', { depth: 1 })
  // `typeof null === 'object'`, so an unset portrait passes a bare typeof test
  // and every character counts as illustrated. Check the value first.
  const asMedia = (value: Character['portrait']): Media | null =>
    value && typeof value === 'object' ? (value as Media) : null

  const withPortrait = characters.filter((character) => asMedia(character.portrait))

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
      role: character.role ? (ROLE[character.role] ?? character.role) : '',
      romance: character.romanceable ? 'Romanceable' : '',
      summary: character.summary ?? '',
    }
  })

  return (
    <>
      <PageHeader
        art={sectionArt('characters')}
        eyebrow="Database"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Characters' }]}
        icon="person"
        title="Characters"
        lede={`${characters.length} catalogued. Two of these gate endings — finish their questlines late and the ending is simply not offered. ${withPortrait.length} have official portraits; the rest are waiting on art a source actually names.`}
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
