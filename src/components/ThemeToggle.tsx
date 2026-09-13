'use client'

import { useEffect, useState } from 'react'
import { Icon } from './Icon'

const STORAGE_KEY = 'dw-theme'

/**
 * A plain dark-mode switch. The site is dark by default because that is how a
 * game database gets read — usually beside a running game — and light is the
 * alternate rather than the origin.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: light)')
    let stored: string | null = null
    try {
      stored = window.localStorage.getItem(STORAGE_KEY)
    } catch {
      // Blocked storage just means following the system.
    }
    if (stored === 'light' || stored === 'dark') {
      setTheme(stored)
      return
    }
    setTheme(media.matches ? 'light' : 'dark')
    const onChange = (event: MediaQueryListEvent) => setTheme(event.matches ? 'light' : 'dark')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Not remembering the choice is not worth an error.
    }
  }

  return (
    <button
      type="button"
      className="icon-btn"
      id="theme-toggle"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
    >
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={17} />
    </button>
  )
}

/** Applied before first paint so a remembered choice never flashes the other theme. */
export const themeScript = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t)}}catch(e){}})()`
