'use client'

import { useState } from 'react'
import { useRun } from './RunProvider'
import { useUi } from './UiStrings'

/**
 * Story spoilers stay covered until asked for.
 *
 * This is a guide to a game whose entire hook is which ending you get, and
 * every competing site prints the outcome in the opening paragraph. Covering
 * it by default is the difference between a page you can read mid-run and one
 * you have to avoid.
 */
export function Spoiler({
  children,
  label,
}: {
  children: React.ReactNode
  /** Falls back to the registry's word for a covered passage. */
  label?: string
}) {
  const ui = useUi()
  const { hideSpoilers, hydrated } = useRun()
  const [revealed, setRevealed] = useState(false)

  // Before hydration, assume covered. Flashing a spoiler for one frame is the
  // one failure mode this component must never have.
  const covered = (!hydrated || hideSpoilers) && !revealed

  if (!covered) return <>{children}</>

  return (
    <button type="button" className="spoiler" onClick={() => setRevealed(true)}>
      <span className="spoiler-label">
        {label ?? ui.t('spoiler.label')} {ui.t('spoiler.reveal')}
      </span>
    </button>
  )
}

export function SpoilerSetting() {
  const ui = useUi()
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
      <span>{ui.t('spoiler.setting')}</span>
    </label>
  )
}
