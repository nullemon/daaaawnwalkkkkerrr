import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/PageHeader'

export const metadata: Metadata = {
  title: 'How this site builds its data',
  description:
    'Where the facts on this site come from, how confidence ratings work, and what we deliberately do not claim to know.',
  alternates: { canonical: '/about' },
}

export default function AboutPage() {
  return (
    <>
      <PageHeader
        eyebrow="About"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'About the data' }]}
        title="How this site builds its data"
        lede="Short version: carefully, from public sources, without access to the game — and we tell you which numbers that makes shaky."
      />
      <div className="page body-main">
        <div className="prose">
          <h2>Where the facts come from</h2>
          <p>
            Every page cites its sources at the foot, with the date we read them. We compile facts
            from public wikis, guides and reporting, then write our own prose. We never copy text or
            reproduce another site&rsquo;s tables. Facts are not anyone&rsquo;s property; the way
            they were written up is.
          </p>

          <h2>What the confidence badges mean</h2>
          <ul>
            <li>
              <strong>High</strong> — agreed by multiple independent sources.
            </li>
            <li>
              <strong>Medium</strong> — one good source, or sources that disagree on detail.
            </li>
            <li>
              <strong>Low</strong> — contested, inferred, or not confirmed anywhere we trust.
            </li>
          </ul>
          <p>
            These are not decoration. Published quest counts for this game range from 128 to 233
            depending on who is counting, and at least one ally questline is described with a
            different length and a different final quest name depending on the site. Where sources
            conflict, we say so on the page rather than pick a winner.
          </p>

          <h2>What we do not claim to know</h2>
          <p>
            Per-quest segment costs. Nobody publishes figures we can stand behind, so we leave them
            blank and the <Link href="/tools/run-checker">run checker</Link> reports its totals as a
            floor. An unknown cost is not a zero cost, and a tool that quietly treats it as one
            would be worse than no tool.
          </p>

          <h2>How to help</h2>
          <p>
            If you have the game in front of you and can confirm a figure,{' '}
            <Link href="/corrections">send it in</Link>. Corrections go to a review queue, and a
            confirmed one raises the page&rsquo;s confidence rating along with the fix.
          </p>

          <h2>Affiliation</h2>
          <p>
            None. This is an unofficial fan project. The Blood of Dawnwalker is developed by Rebel
            Wolves and published by Bandai Namco Entertainment, and all game names and trademarks
            belong to them.
          </p>
        </div>
      </div>
    </>
  )
}
