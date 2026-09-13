import { Icon, type IconName } from './Icon'

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
 * hundred pages would be worse than the icon the page already carries. Credit
 * is shown whenever the media record has it, because game art is used here on
 * tolerance rather than licence.
 */
export function EntityImage({
  media,
  fallbackIcon,
  shape = 'wide',
}: {
  media?: unknown
  fallbackIcon?: IconName
  shape?: 'wide' | 'portrait' | 'square'
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
      />
      {image.credit ? <figcaption>{image.credit}</figcaption> : null}
    </figure>
  )
}
