import type { Metadata } from 'next'
import { PageHeader } from '@/components/PageHeader'
import { CorrectionForm } from '@/components/CorrectionForm'

export const metadata: Metadata = {
  title: 'Report an error',
  description: 'Found something wrong on this site? Tell us, and we will fix it.',
  alternates: { canonical: '/corrections' },
  robots: { index: false, follow: true },
}

export default function CorrectionsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Help us"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Report an error' }]}
        title="Something wrong?"
        lede="This site is built from public sources by people who do not have the game in front of them. Some of it will be wrong. Telling us is the fastest way it stops being wrong."
      />
      <div className="page body-main">
        <CorrectionForm />
      </div>
    </>
  )
}
