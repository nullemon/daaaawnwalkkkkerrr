import { getPayload } from 'payload'
import config from '@payload-config'
import { glyphBox, markPath, ACCENT } from '@/lib/brand'

/**
 * The mark on the admin's login screen.
 *
 * Payload ships its own wordmark there, which on a network with its own brand
 * is somebody else's logo on the first screen an owner sees every morning.
 * This is the same `<path>` the site's rail, the favicon and the share card
 * are drawn from — `lib/brand.ts` — so the four cannot drift, and the name
 * beside it is read from Site settings rather than typed, which is what makes
 * renaming the network one box in one place.
 *
 * Deliberately not the uploaded logo image. That one is a reader-facing brand
 * on a page with the site's own palette; this sits on Payload's login card in
 * Payload's colours, where an arbitrary raster of unknown proportion and
 * contrast is a good way to make the sign-in screen look broken. The drawn
 * mark takes `currentColor` and cannot.
 */
export default async function AdminLogo() {
  const payload = await getPayload({ config })
  const settings = (await payload.findGlobal({ slug: 'site-settings', depth: 0 })) as {
    siteName?: string | null
    tagline?: string | null
  }
  const [, , boxW, boxH] = glyphBox().split(' ').map(Number)

  return (
    <div className="net-login-brand">
      <svg
        width={Math.round((46 * boxW) / boxH)}
        height={46}
        viewBox={glyphBox()}
        aria-hidden="true"
        focusable="false"
      >
        <path d={markPath()} fill={ACCENT} fillRule="evenodd" />
      </svg>
      <span className="net-login-name">{settings.siteName ?? 'Network'}</span>
      {settings.tagline ? <span className="net-login-tag">{settings.tagline}</span> : null}
    </div>
  )
}
