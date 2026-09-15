import type { Metadata } from 'next'
import { PageHeader } from '@/components/PageHeader'
import { AccountPanel } from '@/components/AccountPanel'

export const metadata: Metadata = {
  title: 'Your account',
  description: 'Optional sign-in so your run follows you between devices.',
  alternates: { canonical: '/account' },
  robots: { index: false, follow: true },
}

export default function AccountPage() {
  return (
    <>
      <PageHeader
        eyebrow="Account"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Account' }]}
        title="Sign in, or don't"
        lede="The whole site works without an account. This exists for one thing: picking up the same run on another device."
      />
      <div className="page body-main">
        <AccountPanel />
      </div>
    </>
  )
}
