import type { Metadata } from 'next'
import { PageHeader } from '@/components/PageHeader'
import { SearchBox } from '@/components/SearchBox'

export const metadata: Metadata = {
  title: 'Search',
  description: 'Search every quest, item, perk, character and guide on the site.',
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
