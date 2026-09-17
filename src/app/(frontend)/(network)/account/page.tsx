import type { Metadata } from 'next'
import { PageHeader } from '@/components/PageHeader'
import { AccountPanel } from '@/components/AccountPanel'
import { gameUrl, getPublishedGames } from '@/lib/payload'

export const metadata: Metadata = {
  title: 'Your account',
  description: 'Optional sign-in so your run follows you between devices.',
  alternates: { canonical: '/account' },
  robots: { index: false, follow: true },
}

export default async function AccountPage() {
  /*
    The run checker lives on a wiki, and this page lives on the hub. A
    root-relative `/tools/run-checker` from here is read by `proxy.ts` as the
    wiki slug "tools" and 308s to a host that does not exist, so the button
    was dead for every signed-in reader who pressed it. Resolve the wiki that
    actually has the planner and cross the origin on purpose.
  */
  const games = await getPublishedGames()
  const planner = games.find((game) => (game.features ?? []).includes('run-checker'))
  const checkerHref = planner ? `${await gameUrl(planner)}/tools/run-checker` : null

  return (
    <>
      <PageHeader
        eyebrow="Account"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Account' }]}
        title="Sign in, or don't"
        lede="The whole site works without an account. This exists for one thing: picking up the same run on another device."
      />
      <div className="page body-main">
        <AccountPanel checkerHref={checkerHref} />
      </div>
    </>
  )
}
