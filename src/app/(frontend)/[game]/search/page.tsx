import type { Metadata } from 'next'
import { PageHeader } from '@/components/PageHeader'
import { SearchBox } from '@/components/SearchBox'

export const metadata: Metadata = {
  title: 'Search',
  /*
    "perk" is gone. Perks are Dawnwalker's — `REHOME` in the entity seeder
    folds them into mechanics for every other wiki — and this is a static
    module-level `metadata` under `[game]`, so the same byte-identical sentence
    was served on all eight. Quests, items and characters are seeded on every
    wiki, so they stay.
  */
  description: 'Search every quest, item, character and guide on this wiki.',
  alternates: { canonical: '/search' },
  robots: { index: false, follow: true },
}

export default function SearchPage() {
  return (
    <>
      <PageHeader
        eyebrow="Search"
        icon="search"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Search' }]}
        title="Search"
        lede="Everything in the database, in one box."
      />
      <div className="page body-main">
        <SearchBox />
      </div>
    </>
  )
}
