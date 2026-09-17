'use client'

import { useEffect, useState } from 'react'
import { THEME_STORAGE_KEY as STORAGE_KEY } from '@/lib/appearance'
import { Icon } from './Icon'

/**
 * A plain dark-mode switch. The site is dark by default because that is how a
 * game database gets read — usually beside a running game — and light is the
 * alternate rather than the origin. Site settings → Appearance can make that
 * default light, or hand it to the system; this button overrides whichever it
 * is, for this reader, permanently.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')

  useEffect(() => {
    /*
      Read the attribute, not localStorage.

      The before-paint script has already decided, weighing a remembered
      choice against the network default from Site settings, and it is the
      only thing that knows both. This used to redo half of that decision —
      storage, else the system — which was right until there was a network
      default: with the default set to dark on a machine set to light, the
      page was dark and the button offered to switch to light, so the first
      press did nothing anybody could see.

      No attribute means the script chose to set none, which is what
      "follow the system" is, so that case follows the system here too.
    */
    const attribute = document.documentElement.getAttribute('data-theme')
    if (attribute === 'light' || attribute === 'dark') {
      setTheme(attribute)
      return
    }
    const media = window.matchMedia('(prefers-color-scheme: light)')
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
