import type { Metadata } from 'next'
import { getGame, getSiteSettings } from './payload'

/**
 * Which verification and analytics tags a given host should serve.
 *
 * A game's own value wins; an empty one falls back to the network's. That
 * ordering is the whole of the rule, and it is applied field by field rather
 * than group by group — a wiki that sets only its Search Console token should
 * still inherit the network's analytics, and grouping the fallback would make
 * setting one silently drop the other.
 */

export type Tags = {
  verification: {
    google?: string | null
    bing?: string | null
    yandex?: string | null
    pinterest?: string | null
    facebookDomain?: string | null
  }
  analytics: {
    ga4Id?: string | null
    gtmId?: string | null
    plausibleDomain?: string | null
    clarityId?: string | null
    headHtml?: string | null
  }
}

const pick = <T extends Record<string, unknown>>(
  game: T | undefined | null,
  network: T | undefined | null,
): T => {
  const out: Record<string, unknown> = {}
  for (const key of new Set([...Object.keys(game ?? {}), ...Object.keys(network ?? {})])) {
    const own = (game as Record<string, unknown> | null | undefined)?.[key]
    out[key] =
      typeof own === 'string' && own.trim() !== ''
        ? own.trim()
        : ((network as Record<string, unknown> | null | undefined)?.[key] ?? null)
  }
  return out as T
}

/** Pass a game slug for a wiki, or nothing for the hub. */
export const resolveTags = async (gameSlug?: string): Promise<Tags> => {
  const settings = await getSiteSettings()
  const game = gameSlug ? await getGame(gameSlug) : null

  return {
    verification: pick(game?.verification as Tags['verification'], settings.verification as Tags['verification']),
    analytics: pick(game?.analytics as Tags['analytics'], settings.analytics as Tags['analytics']),
  }
}

/**
 * The verification half, as Next.js metadata.
 *
 * Next has first-class fields for Google and Yandex; everything else goes
 * through `other`, which emits a plain `<meta name content>`. Bing's tag name
 * is `msvalidate.01` and Facebook's is `facebook-domain-verification` —
 * neither is guessable, and getting either wrong fails silently as a
 * verification that never completes.
 */
export const verificationMetadata = (tags: Tags): Metadata['verification'] => {
  const { google, bing, yandex, pinterest, facebookDomain } = tags.verification

  const other: Record<string, string> = {}
  if (bing) other['msvalidate.01'] = bing
  if (pinterest) other['p:domain_verify'] = pinterest
  if (facebookDomain) other['facebook-domain-verification'] = facebookDomain

  const verification: Metadata['verification'] = {}
  if (google) verification.google = google
  if (yandex) verification.yandex = yandex
  if (Object.keys(other).length > 0) verification.other = other

  return Object.keys(verification).length > 0 ? verification : undefined
}
