import type { DirectoryEntry } from '@/lib/directory'
import type { Media } from '@/payload-types'

/**
 * The pictures a wiki can be shown with, and which to reach for.
 *
 * Three kinds exist and none of them is complete on its own:
 *
 * - `theme.hero` — wide key art. **13 of 15.** GTA 6 and Fire Emblem have no
 *   Steam listing, so there was never a 16:9 press shot to take.
 * - `profile.poster` — box art, harvested from Wikipedia with its licence
 *   recorded. **14 of 15.** Forza Horizon 6's article carries no cover.
 * - the per-wiki favicon, which every wiki has but is 32px.
 *
 * Every wiki has at least one of the first two, which is the only reason a
 * layout can lean on art at all. `wide` and `box` each fall back to the other
 * kind rather than to nothing, because a grid with one empty cell in it reads
 * as broken in a way that a slightly wrong aspect ratio does not.
 *
 * **No fallback to another game's art, ever** — there is nothing here that
 * could reach one. That rule and what it cost to learn is in
 * `src/seed/game-art-pool.ts`.
 */
export type WikiArt = {
  hero: Media | null
  poster: Media | null
  /** Prefer landscape: banners, bands, wide cards. */
  wide: Media | null
  /** Prefer portrait: shelves, poster walls, tiles. */
  box: Media | null
  /** Always present, always small. */
  icon: string
}

const asMedia = (value: unknown): Media | null =>
  value && typeof value === 'object' ? (value as Media) : null

export const artOf = (entry: DirectoryEntry): WikiArt => {
  const hero = asMedia(entry.game.theme?.hero)
  const poster = asMedia(entry.game.profile?.poster)
  return {
    hero,
    poster,
    wide: hero ?? poster,
    box: poster ?? hero,
    icon: `/wiki-assets/${entry.game.slug}/icon-32.png`,
  }
}

/** The best available source URL at roughly the size asked for. */
export const src = (media: Media | null, size: 'card' | 'hero' = 'card'): string =>
  media?.sizes?.[size]?.url ?? media?.url ?? ''
