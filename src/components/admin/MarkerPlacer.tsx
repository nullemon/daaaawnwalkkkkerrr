'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm, useFormFields } from '@payloadcms/ui'

/**
 * Place map markers by clicking the map, in the admin.
 *
 * ## Why this exists
 *
 * The alternative is typing two percentages per pin. A map with two hundred
 * collectibles on it is four hundred numbers that nobody can check by reading
 * them, and the only way to find a mistake is to publish the page and look —
 * which means the error is live before it is visible. Clicking the map is the
 * same data entered in the one form where it can be verified as it is typed.
 *
 * ## How it talks to the form
 *
 * Through `dispatchFields`, which is Payload's own reducer for form state, so
 * a pin added here is an ordinary unsaved change: it shows in the Markers
 * array below, it can be edited or deleted there, and it is not written until
 * the document is saved. Reaching into the array's DOM instead would produce
 * a pin that looks placed and vanishes on save.
 *
 * The new row carries the coordinates and nothing else. Label and source are
 * left empty on purpose — `markerSource` is a required field, so a pin placed
 * here cannot be saved until somebody says where the position came from.
 * That is the point rather than an inconvenience.
 */

type ArrayRow = { id?: string }

export default function MarkerPlacer() {
  const { dispatchFields } = useForm()
  const [hint, setHint] = useState<string | null>(null)
  const frame = useRef<HTMLDivElement>(null)

  /*
    Read the image and the existing rows straight from form state, so the
    preview reflects unsaved edits — including a base image swapped a moment
    ago, which is exactly when you want to see where the old pins landed.
  */
  const imageValue = useFormFields(([fields]) => fields?.image?.value)
  const rows = useFormFields(([fields]) => fields?.markers?.rows) as ArrayRow[] | undefined
  const markerCount = rows?.length ?? 0

  const positions = useFormFields(([fields]) => {
    const found: { x: number; y: number; label: string }[] = []
    for (let index = 0; index < 400; index += 1) {
      const x = fields?.[`markers.${index}.x`]?.value
      const y = fields?.[`markers.${index}.y`]?.value
      if (typeof x !== 'number' || typeof y !== 'number') {
        if (index >= (rows?.length ?? 0)) break
        continue
      }
      found.push({
        x,
        y,
        label: String(fields?.[`markers.${index}.label`]?.value ?? `Marker ${index + 1}`),
      })
    }
    return found
  }) as { x: number; y: number; label: string }[]

  /*
    The upload field holds an id before the document is saved and a populated
    object after, so both shapes have to resolve to a URL. Falling back to the
    REST endpoint by id covers the first case without a fetch.
  */
  const imageUrl = useMemo(() => {
    if (!imageValue) return null
    if (typeof imageValue === 'object') {
      const media = imageValue as { url?: string; filename?: string }
      return media.url ?? (media.filename ? `/api/media/file/${media.filename}` : null)
    }
    return `/api/media/${imageValue}?depth=0`
  }, [imageValue])

  const [resolved, setResolved] = useState<string | null>(null)

  /*
    An id-only value needs one call to find the real file URL. This is an
    effect rather than a ref callback because a ref callback cannot be async -
    React expects it to return a cleanup function or nothing, and returning a
    promise is a type error today and a silently ignored cleanup tomorrow.
  */
  useEffect(() => {
    if (!imageUrl || imageUrl.includes('/file/')) return
    let cancelled = false
    void (async () => {
      try {
        const response = await fetch(imageUrl)
        const doc = (await response.json()) as { url?: string }
        if (!cancelled && doc?.url) setResolved(doc.url)
      } catch {
        /* Leaves the placeholder message below, which is the honest state. */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [imageUrl])

  const src = resolved ?? (imageUrl && imageUrl.includes('/file/') ? imageUrl : null)

  const place = (event: React.MouseEvent<HTMLDivElement>) => {
    const box = frame.current?.getBoundingClientRect()
    if (!box) return

    const x = Number((((event.clientX - box.left) / box.width) * 100).toFixed(2))
    const y = Number((((event.clientY - box.top) / box.height) * 100).toFixed(2))

    dispatchFields({
      type: 'ADD_ROW',
      path: 'markers',
      rowIndex: markerCount,
      subFieldState: {
        x: { initialValue: x, valid: true, value: x },
        y: { initialValue: y, valid: true, value: y },
      },
    })

    setHint(`Placed a pin at ${x}%, ${y}% — give it a label and a source below.`)
  }

  if (!src) {
    return (
      <div className="field-type">
        <p style={{ color: 'var(--theme-elevation-500)', fontSize: 13, margin: '4px 0 0' }}>
          Choose a base map above and save, then click the image here to place pins.
        </p>
      </div>
    )
  }

  return (
    <div className="field-type">
      <div style={{ marginBottom: 6, fontSize: 13, color: 'var(--theme-elevation-600)' }}>
        Click the map to drop a pin. It appears in Markers below as an unsaved row — nothing is
        written until you save, and it will not save without a source.
      </div>

      <div
        ref={frame}
        onClick={place}
        style={{
          position: 'relative',
          cursor: 'crosshair',
          border: '1px solid var(--theme-elevation-150)',
          borderRadius: 4,
          overflow: 'hidden',
          lineHeight: 0,
        }}
      >
        <img src={src} alt="" style={{ width: '100%', display: 'block' }} />
        {positions.map((pin, index) => (
          <span
            key={`${pin.x}-${pin.y}-${index}`}
            title={pin.label}
            style={{
              position: 'absolute',
              left: `${pin.x}%`,
              top: `${pin.y}%`,
              width: 12,
              height: 12,
              marginLeft: -6,
              marginTop: -6,
              borderRadius: '50%',
              background: 'var(--theme-success-500, #35b37e)',
              border: '2px solid #fff',
              boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
            }}
          />
        ))}
      </div>

      {hint ? (
        <p style={{ fontSize: 12.5, color: 'var(--theme-elevation-600)', margin: '6px 0 0' }}>
          {hint}
        </p>
      ) : null}
    </div>
  )
}
