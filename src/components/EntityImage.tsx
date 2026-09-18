import { Icon, type IconName } from './Icon'
import { ImageCredit } from './ImageCredit'

type MediaLike = {
  url?: string | null
  alt?: string | null
  credit?: string | null
  width?: number | null
  height?: number | null
}

/**
 * The picture for a record, where one has been attached.
 *
 * Renders nothing at all when there is no image — a placeholder box on four
 * hundred pages would be worse than the icon the page already carries.
 *
 * The credit is stored on every image and printed only when Site settings →
 * Content says to, the same arrangement the source list has. That decision
 * now lives in `ImageCredit` rather than being re-read here — it was read in
 * two components and ignored in three others, so one page could credit its
 * cover art and not the photograph beside it.
 */
export async function EntityImage({
  media,
  fallbackIcon,
  shape = 'wide',
  priority = false,
}: {
  media?: unknown
  fallbackIcon?: IconName
  shape?: 'wide' | 'portrait' | 'square'
  /**
   * This is the record's own picture, at the top of its own page.
   *
   * Every one of the fifteen detail routes passes it, and that is the whole
   * reason it exists: the picture sits about two thousand characters into the
   * document, above the fold, and on the 1,575 records that have one it is the
   * largest thing painted - the LCP element by definition. `loading="lazy"`
   * defers an image until layout has run and the browser knows where it
   * landed, which is exactly the delay LCP measures, and the browser does not
   * second-guess the attribute for something this high in the document. So
   * every record page on the network was deferring the one image it is
   * measured on, and nothing about that was visible: the page renders, the
   * picture arrives, no check has an opinion.
   *
   * Opt-in rather than the default, because the fix has to survive this
   * component being dropped into a list. Eager on an index that renders thirty
   * of these would race the header art and be worse than the bug. Same
   * attributes as `PersonProfile` and the companies logo, which are the same
   * slot on the two hosts that are not wikis.
   */
  priority?: boolean
}) {
  const image = media && typeof media === 'object' ? (media as MediaLike) : null

  if (!image?.url) {
    if (!fallbackIcon) return null
    return (
      <div className="entity-figure" data-shape={shape} data-empty="true">
        <Icon name={fallbackIcon} size={40} />
      </div>
    )
  }

  return (
    <figure className="entity-figure" data-shape={shape}>
      <img
        src={image.url}
        alt={image.alt ?? ''}
        width={image.width ?? undefined}
        height={image.height ?? undefined}
        {...(priority ? { fetchPriority: 'high' as const } : { loading: 'lazy' as const })}
        decoding="async"
      />
      {/* `wide` is 640px and holds about 65 characters a line; the other two
          shapes are 300 and 260, which is the `narrow` budget. Past it the
          credit prints under the picture rather than being cut short — see
          `creditPlacement`. */}
      <ImageCredit credit={image.credit} slot={shape === 'wide' ? 'wide' : 'narrow'} />
    </figure>
  )
}
