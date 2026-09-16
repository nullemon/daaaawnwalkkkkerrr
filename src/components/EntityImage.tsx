import { Icon, type IconName } from './Icon'
import { getSiteSettings } from '@/lib/payload'

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
 * Content says to, the same arrangement the source list has. It is off by
 * default by the owner's decision; the reason to turn it on is recorded on
 * that field, because the harvested images are CC BY-SA and attribution is
 * that licence's condition rather than its courtesy.
 */
export async function EntityImage({
  media,
  fallbackIcon,
  shape = 'wide',
}: {
  media?: unknown
  fallbackIcon?: IconName
  shape?: 'wide' | 'portrait' | 'square'
}) {
  const image = media && typeof media === 'object' ? (media as MediaLike) : null
  const settings = await getSiteSettings()
  const showCredit = Boolean(settings.showImageCredits)

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
      />
      {showCredit && image.credit ? <figcaption>{image.credit}</figcaption> : null}
    </figure>
  )
}
