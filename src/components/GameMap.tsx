'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from './Icon'

/**
 * An interactive map: pan, zoom, filter, and tick off what you have found.
 *
 * ## Why this is hand-rolled rather than a mapping library
 *
 * Leaflet is the obvious reach and it is the wrong shape. It wants tiles and a
 * coordinate system, and it arrives with projection maths for a globe this
 * site does not have. What is actually needed is one image, a transform, and
 * pins positioned as a percentage of it — a few hundred lines against a
 * 150KB dependency that every reader would download to look at a JPEG.
 *
 * Percentages rather than pixels for the same reason: the pin data then
 * survives the base image being re-exported at a different size, which it will
 * be the first time somebody finds a cleaner scan.
 *
 * ## The found list
 *
 * Kept in this browser and nowhere else. It is the one piece of state here
 * that is genuinely per-person and worthless to anybody else, and a reader
 * ticking off collectibles should not need an account. `localStorage` throws
 * in a private window and can come back empty after a clear, so every read and
 * write is wrapped and the map renders correctly when it fails.
 */

export type MapMarker = {
  id: string
  label: string
  category?: string | null
  x: number
  y: number
  note?: string | null
  href?: string | null
  source?: string | null
}

export type MapCategory = { key: string; label: string; colour?: string | null }

const MIN_ZOOM = 1
const MAX_ZOOM = 8

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

export function GameMap({
  slug,
  image,
  alt,
  markers,
  categories,
}: {
  slug: string
  image: string
  alt: string
  markers: MapMarker[]
  categories: MapCategory[]
}) {
  const frame = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [found, setFound] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState<string | null>(null)
  const [hideFound, setHideFound] = useState(false)
  const [ready, setReady] = useState(false)

  const storageKey = `map-found:${slug}`

  /* Read the found list once, on the client, after hydration. */
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (raw) setFound(new Set(JSON.parse(raw) as string[]))
    } catch {
      /* Private window, or site data blocked. The map still works. */
    }
    setReady(true)
  }, [storageKey])

  const toggleFound = useCallback(
    (id: string) => {
      setFound((current) => {
        const next = new Set(current)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        try {
          window.localStorage.setItem(storageKey, JSON.stringify([...next]))
        } catch {
          /* Not fatal: the tick just will not survive a reload. */
        }
        return next
      })
    },
    [storageKey],
  )

  const visible = useMemo(
    () =>
      markers.filter((marker) => {
        if (marker.category && hidden.has(marker.category)) return false
        if (hideFound && found.has(marker.id)) return false
        return true
      }),
    [markers, hidden, hideFound, found],
  )

  const colourOf = useCallback(
    (key?: string | null) =>
      categories.find((category) => category.key === key)?.colour || 'var(--accent)',
    [categories],
  )

  /*
    Zoom towards the pointer rather than the centre.

    Zooming to the centre is the thing that makes a map feel broken: you put
    the cursor on a pin, scroll, and the pin leaves the screen. Keeping the
    point under the cursor fixed is the whole trick, and it is just solving for
    the pan that leaves that point where it was.
  */
  const zoomTo = useCallback(
    (next: number, originX?: number, originY?: number) => {
      const box = frame.current?.getBoundingClientRect()
      if (!box) return
      const target = clamp(next, MIN_ZOOM, MAX_ZOOM)
      const cx = originX ?? box.width / 2
      const cy = originY ?? box.height / 2

      setPan((current) => {
        const scale = target / zoom
        return {
          x: cx - (cx - current.x) * scale,
          y: cy - (cy - current.y) * scale,
        }
      })
      setZoom(target)
    },
    [zoom],
  )

  /*
    Wheel zoom is bound here rather than with onWheel, because React attaches
    wheel listeners passively and a passive listener cannot call
    preventDefault — so the page scrolled behind the map on every zoom.
  */
  useEffect(() => {
    const node = frame.current
    if (!node) return

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const box = node.getBoundingClientRect()
      zoomTo(zoom * (event.deltaY < 0 ? 1.18 : 1 / 1.18), event.clientX - box.left, event.clientY - box.top)
    }

    node.addEventListener('wheel', onWheel, { passive: false })
    return () => node.removeEventListener('wheel', onWheel)
  }, [zoom, zoomTo])

  /* Drag to pan, with pointer events so a finger and a mouse are one path. */
  const drag = useRef<{ id: number; x: number; y: number } | null>(null)

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return
    drag.current = { id: event.pointerId, x: event.clientX - pan.x, y: event.clientY - pan.y }
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: React.PointerEvent) => {
    if (!drag.current || drag.current.id !== event.pointerId) return
    setPan({ x: event.clientX - drag.current.x, y: event.clientY - drag.current.y })
  }

  const onPointerUp = (event: React.PointerEvent) => {
    if (drag.current?.id === event.pointerId) drag.current = null
    ;(event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId)
  }

  const reset = () => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
    setOpen(null)
  }

  const openMarker = visible.find((marker) => marker.id === open) ?? null
  const countFound = markers.filter((marker) => found.has(marker.id)).length

  return (
    <div className="gamemap">
      <div className="gamemap-bar">
        <div className="gamemap-filters">
          {categories.map((category) => {
            const off = hidden.has(category.key)
            const count = markers.filter((marker) => marker.category === category.key).length
            return (
              <button
                key={category.key}
                type="button"
                className="gamemap-chip"
                data-off={off ? 'true' : undefined}
                onClick={() =>
                  setHidden((current) => {
                    const next = new Set(current)
                    if (next.has(category.key)) next.delete(category.key)
                    else next.add(category.key)
                    return next
                  })
                }
                aria-pressed={!off}
              >
                <span
                  className="gamemap-swatch"
                  style={{ background: category.colour || 'var(--accent)' }}
                  aria-hidden="true"
                />
                {category.label}
                <span className="gamemap-chip-count">{count}</span>
              </button>
            )
          })}
        </div>

        <div className="gamemap-tools">
          {markers.length > 0 && ready ? (
            <>
              <span className="gamemap-progress">
                {countFound} / {markers.length} found
              </span>
              <button
                type="button"
                className="gamemap-chip"
                data-off={hideFound ? undefined : 'true'}
                onClick={() => setHideFound((current) => !current)}
                aria-pressed={hideFound}
              >
                Hide found
              </button>
            </>
          ) : null}
          <button type="button" className="icon-btn" onClick={() => zoomTo(zoom * 1.4)} aria-label="Zoom in">
            +
          </button>
          <button type="button" className="icon-btn" onClick={() => zoomTo(zoom / 1.4)} aria-label="Zoom out">
            &minus;
          </button>
          <button type="button" className="icon-btn" onClick={reset} aria-label="Reset the view">
            <Icon name="search" size={15} />
          </button>
        </div>
      </div>

      <div
        className="gamemap-frame"
        ref={frame}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          className="gamemap-plane"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        >
          <img className="gamemap-image" src={image} alt={alt} draggable={false} />

          {visible.map((marker) => (
            <button
              key={marker.id}
              type="button"
              className="gamemap-pin"
              data-found={found.has(marker.id) ? 'true' : undefined}
              style={{
                left: `${marker.x}%`,
                top: `${marker.y}%`,
                // Counter-scale so a pin is the same size at every zoom. Without
                // this the pins grow into blobs that cover what they mark.
                transform: `translate(-50%, -100%) scale(${1 / zoom})`,
                ['--pin' as string]: colourOf(marker.category),
              }}
              onClick={(event) => {
                event.stopPropagation()
                setOpen(marker.id)
              }}
              aria-label={marker.label}
              title={marker.label}
            />
          ))}
        </div>

        {openMarker ? (
          <div className="gamemap-popup" role="dialog" aria-label={openMarker.label}>
            <button
              type="button"
              className="gamemap-popup-close"
              onClick={() => setOpen(null)}
              aria-label="Close"
            >
              &times;
            </button>
            <h3>{openMarker.label}</h3>
            {openMarker.note ? <p className="note">{openMarker.note}</p> : null}
            {openMarker.href ? (
              <p>
                <a href={openMarker.href}>Open its page</a>
              </p>
            ) : null}
            <label className="gamemap-found">
              <input
                type="checkbox"
                checked={found.has(openMarker.id)}
                onChange={() => toggleFound(openMarker.id)}
              />
              Mark as found
            </label>
            {openMarker.source ? (
              <p className="gamemap-source">Position from {openMarker.source}</p>
            ) : null}
          </div>
        ) : null}
      </div>

      <p className="note gamemap-help">
        Drag to move, scroll to zoom, click a pin for what is there. What you tick off is kept in
        this browser only — there is no account behind it and nothing is sent anywhere.
      </p>
    </div>
  )
}
