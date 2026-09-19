'use client'

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * Show a different handful of people on each visit.
 *
 * ## Why this has to happen in the browser
 *
 * Every public page on this network is prerendered to static HTML, so the
 * markup is built once and served to everybody until the next deploy. A
 * shuffle done on the server is therefore not a shuffle at all: it picks an
 * order at build time and that order is what every reader sees for a
 * fortnight. It would also churn the page on every rebuild for no reason.
 *
 * So the server renders a **stable** first window — the same people, in the
 * same order, in the HTML a crawler reads — and the browser rotates to a
 * different window after mount. Nothing is hidden from a reader without
 * JavaScript; they get the first window, which is a real answer rather than
 * an empty box.
 *
 * ## Rotate, not shuffle
 *
 * The window moves along the list by a random offset rather than reordering
 * it. Two reasons: the list is deliberately ordered — people credited on the
 * game itself come before people credited on a character — and a rotation
 * keeps neighbours together, so somebody who reloads sees a genuinely
 * different set rather than the same six in a new order.
 *
 * The offset is chosen once per mount, in an effect, so the server's HTML and
 * the client's first paint agree. Picking it during render would be a
 * hydration mismatch on a page whose whole job is to look right.
 */
export function RotatingPeople({
  children,
  window: size,
}: {
  /** Every candidate, already rendered and in a deliberate order. */
  children: ReactNode[]
  /** How many to show at once. */
  window: number
}) {
  const [offset, setOffset] = useState(0)

  useEffect(() => {
    if (children.length <= size) return
    /*
      Any offset except the one already on screen, so a reload always visibly
      changes something — landing back on zero would read as broken.
    */
    const next = 1 + Math.floor(Math.random() * (children.length - 1))
    setOffset(next)
  }, [children.length, size])

  const shown =
    children.length <= size
      ? children
      : Array.from({ length: size }, (_, index) => children[(offset + index) % children.length])

  return <>{shown}</>
}
