'use client'

import { useEffect, useState } from 'react'

type Mode = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'dw-phase'

/**
 * Day and night are the game's two halves, so the theme switch is framed as
 * the phase of the run rather than as a display preference.
 */
export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>('system')
  // What the viewer is actually looking at. With mode 'system' that comes from
  // the OS, so the button has to resolve it rather than assume light.
  const [resolved, setResolved] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    let stored: Mode | null = null
    try {
      stored = window.localStorage.getItem(STORAGE_KEY) as Mode | null
    } catch {
      // Private browsing or blocked storage — the system default is fine.
    }
    if (stored === 'light' || stored === 'dark') {
      setMode(stored)
      setResolved(stored)
      return
    }
    setResolved(media.matches ? 'dark' : 'light')
    const onChange = (event: MediaQueryListEvent) => setResolved(event.matches ? 'dark' : 'light')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  const apply = (next: Mode) => {
    setMode(next)
    if (next !== 'system') setResolved(next)
    const root = document.documentElement
    if (next === 'system') {
      root.removeAttribute('data-theme')
    } else {
      root.setAttribute('data-theme', next)
    }
    try {
      if (next === 'system') window.localStorage.removeItem(STORAGE_KEY)
      else window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Not being able to remember the choice is not worth an error.
    }
  }

  const next: Mode = resolved === 'dark' ? 'light' : 'dark'

  return (
    <button
      type="button"
      className="phase-toggle"
      id="phase-toggle"
      onClick={() => apply(next)}
      aria-label={`Switch to ${next === 'dark' ? 'night' : 'day'}`}
      title={`Switch to ${next === 'dark' ? 'night' : 'day'}`}
    >
      <span aria-hidden="true">{resolved === 'dark' ? '☾' : '☀'}</span>
      <span className="phase-toggle-label">{resolved === 'dark' ? 'Night' : 'Day'}</span>
    </button>
  )
}

/**
 * Applied before first paint so a remembered choice does not flash the other
 * theme. Kept deliberately tiny and dependency-free.
 */
export const themeScript = `(function(){try{var m=localStorage.getItem('${STORAGE_KEY}');if(m==='dark'||m==='light'){document.documentElement.setAttribute('data-theme',m)}}catch(e){}})()`
