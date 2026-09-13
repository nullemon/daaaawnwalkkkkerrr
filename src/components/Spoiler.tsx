'use client'

import { useState } from 'react'
import { useRun } from './RunProvider'

/**
 * Story spoilers stay covered until asked for.
 *
 * This is a guide to a game whose entire hook is which ending you get, and
 * every competing site prints the outcome in the opening paragraph. Covering
 * it by default is the difference between a page you can read mid-run and one
 * you have to avoid.
 */
export function Spoiler({ children, label = 'Spoiler' }: { children: React.ReactNode; label?: string }) {
  const { hideSpoilers, hydrated } = useRun()
  const [revealed, setRevealed] = useState(false)

  // Before hydration, assume covered. Flashing a spoiler for one frame is the
  // one failure mode this component must never have.
  const covered = (!hydrated || hideSpoilers) && !revealed

  if (!covered) return <>{children}</>

  return (
    <button type="button" className="spoiler" onClick={() => setRevealed(true)}>
      <span className="spoiler-label">{label} — click to reveal</span>
    </button>
  )
}

export function SpoilerSetting() {
  const { hideSpoilers, setHideSpoilers, hydrated } = useRun()
  if (!hydrated) return null
  return (
    <label className="spoiler-setting">
      <input
        type="checkbox"
        id="hide-spoilers"
        checked={hideSpoilers}
        onChange={(event) => setHideSpoilers(event.target.checked)}
      />
      <span>Hide story spoilers until I click them</span>
    </label>
  )
}
