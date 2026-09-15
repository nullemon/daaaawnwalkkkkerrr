import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/PageHeader'
import { getAll, getGame } from '@/lib/payload'

type Props = { params: Promise<{ game: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { game: slug } = await params
  const game = await getGame(slug)
  const name = game?.shortTitle || game?.title || 'this game'
  return {
    title: `${name} maps`,
    description: `Interactive maps for ${name}, with every marked location linking to what is recorded about it.`,
    alternates: { canonical: '/maps' },
  }
}

export default async function MapsIndex({ params }: Props) {
  const { game: slug } = await params
  const [game, maps] = await Promise.all([
    getGame(slug),
    getAll('maps', { game: slug, sort: 'order', depth: 1 }),
  ])
  const name = game?.shortTitle || game?.title || 'this game'

  return (
    <>
      <PageHeader
        eyebrow="Database"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Maps' }]}
        icon="map"
        title="Maps"
        lede={`Every map published for ${name}, with what is marked on it linking to the record for that thing.`}
      />
      <div className="page body-main">
        {maps.length === 0 ? (
          <div className="callout">
            <h3>No map has been published for {name} yet</h3>
            <p>
              A map here is a real one — a base image somebody published, and pins whose positions
              come from somebody who actually found the thing. Neither exists for this game yet,
              and both arrive together: you cannot mark where an item is until somebody has played
              far enough to find it.
            </p>
            <p>
              A map drawn from a trailer, with pins placed where they look about right, is worse
              than no map at all, because a reader will walk to them.
            </p>
            <p>
              <Link href="/requests">Tell us which map you want first</Link> ·{' '}
              <Link href="/corrections">Know a location? Send it</Link>
            </p>
          </div>
        ) : (
          <div className="grid">
            {maps.map((map) => {
              const image = typeof map.image === 'object' ? map.image : null
              return (
                <Link key={map.id} href={`/maps/${map.slug}`} className="mapcard">
                  {image?.url ? (
                    <img
                      className="mapcard-image"
                      src={image.sizes?.card?.url ?? image.url}
                      alt=""
                      loading="lazy"
                    />
                  ) : null}
                  <span className="mapcard-body">
                    <h3>{map.title}</h3>
                    {map.summary ? <span className="note">{map.summary}</span> : null}
                    <span className="eyebrow">
                      {(map.markers?.length ?? 0).toLocaleString('en-GB')}{' '}
                      {map.markers?.length === 1 ? 'marker' : 'markers'}
                    </span>
                  </span>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
