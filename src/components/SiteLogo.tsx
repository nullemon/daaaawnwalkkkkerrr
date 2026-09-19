import { Logo } from './Logo'
import { getSiteSettings } from '@/lib/payload'
import type { Media } from '@/payload-types'

/**
 * The mark beside the site name, drawn or uploaded.
 *
 * Four places render it — the rail, the footer, the hub home and each wiki
 * home — and before this each of them called `Logo` directly, so "use a
 * picture instead" would have been four edits and a fifth place to forget.
 * This is the one place that answers the question.
 *
 * ## Why an uploaded logo needs two slots
 *
 * The drawn mark is a single `<path>` filled with `currentColor`, so it is the
 * rail's ink in the dark theme and the rail's ink in the light one without
 * anybody thinking about it. **A raster cannot do that.** A dark-ink logo on
 * the dark rail is an invisible logo, and the failure is silent in the worst
 * way: it looks perfect to whoever uploaded it in the theme they happened to
 * be using.
 *
 * So Site settings holds a second, optional picture for the dark theme, and
 * both are rendered with the theme deciding which is shown. Both, not one
 * swapped by JavaScript: the theme is stamped on `<html>` before first paint
 * by a script in the root layout precisely so nothing flickers, and a logo
 * that arrives a frame late would undo that on every page.
 *
 * ## It renders nothing it cannot support
 *
 * No logo set, or an upload that did not resolve, falls back to the drawn
 * mark. A blank record renders the site the code does, which is the rule the
 * rest of this project's settings follow.
 */
export async function SiteLogo({
  size = 22,
  /** Falls back to the site name, which is right for a wordmark. */
  alt,
}: {
  size?: number
  alt?: string
}) {
  const settings = await getSiteSettings()

  const light = settings.logoImage as Media | number | null | undefined
  const dark = settings.logoImageDark as Media | number | null | undefined

  const lightUrl = light && typeof light === 'object' ? light.url : null
  if (!lightUrl) return <Logo size={size} />

  const darkUrl = dark && typeof dark === 'object' ? dark.url : null
  const label = settings.logoAlt?.trim() || alt || settings.siteName || ''

  return (
    <span className="sitelogo" style={{ height: size }}>
      <img
        className="sitelogo-light"
        src={lightUrl}
        alt={label}
        height={size}
        /*
          No width. These are logos of unknown proportion and naming one would
          squash somebody's mark; the height is the constraint and the CSS
          keeps `width: auto`. It is the one image on the site allowed to do
          that, and it is why `.sitelogo` reserves the height on the wrapper —
          so the row does not jump while the file arrives.
        */
        decoding="async"
      />
      {darkUrl ? (
        <img className="sitelogo-dark" src={darkUrl} alt={label} height={size} decoding="async" />
      ) : null}
    </span>
  )
}
