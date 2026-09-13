import type { Metadata } from 'next'
import { PageHeader } from '@/components/PageHeader'
import { sectionArt } from '@/lib/art'
import { EntityCard } from '@/components/EntityCard'
import { Badge } from '@/components/Badges'
import { getAll } from '@/lib/payload'
import type { Character } from '@/payload-types'

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
  const characters = await getAll<Character>('characters', { depth: 0 })
  return (
    <>
      <PageHeader
        art={sectionArt('characters')}
        eyebrow="Database"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Characters' }]}
        icon="person"
        title="Characters"
        lede="Two of these gate endings. Finish their questlines late and the ending is simply not offered."
      />
      <div className="page body-main">
        <div className="grid">
          {characters.map((character) => (
            <EntityCard
              key={character.id}
              href={`/characters/${character.slug}`}
              title={character.title}
              summary={character.summary}
              badges={
                <>
                  {character.role ? <Badge>{ROLE[character.role]}</Badge> : null}
                  {character.romanceable ? <Badge>Romanceable</Badge> : null}
                </>
              }
            />
          ))}
        </div>
      </div>
    </>
  )
}
