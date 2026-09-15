'use client'

import { useMemo, useRef, useState } from 'react'
import { Icon } from './Icon'

/**
 * The network's search box, on the hub.
 *
 * Each wiki has its own search over its own records. The hub had none at all,
 * which is the wrong way round: somebody arriving at the apex domain does not
 * yet know which wiki they want, and that is precisely the question a search
 * box should answer.
 *
 * Deliberately small. It searches the eight wikis and their headline pages —
 * enough to route a visitor to the right place, where the real search lives.
 * Shipping the whole network's index to the front page would cost more than it
 * returns.
 */

export type HubTarget = {
  label: string
  sub: string
  href: string
  icon?: string | null
  kind: 'wiki' | 'page'
}

export function HubSearch({ targets }: { targets: HubTarget[] }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  const box = useRef<HTMLDivElement>(null)

  const hits = useMemo(() => {
    const text = query.trim().toLowerCase()
    if (text.length < 2) return []

    return targets
      .map((target) => {
        const label = target.label.toLowerCase()
        // Rank by where the match falls: a wiki whose name starts with what
        // you typed is almost always the one you meant.
        const score = label.startsWith(text)
          ? 0
          : label.includes(text)
            ? 1
            : target.sub.toLowerCase().includes(text)
              ? 2
              : -1
        return { target, score }
      })
      .filter((entry) => entry.score >= 0)
      .sort((a, b) => a.score - b.score || (a.target.kind === 'wiki' ? -1 : 1))
      .slice(0, 8)
      .map((entry) => entry.target)
  }, [query, targets])

  const go = (target: HubTarget) => {
    window.location.href = target.href
  }

  return (
    <div className="hubsearch" ref={box}>
      <div className="hubsearch-field">
        <span className="hubsearch-icon" aria-hidden="true">
          <Icon name="search" size={18} />
        </span>
        <input
          type="search"
          value={query}
          placeholder="Search the network — a game, a boss, a guide…"
          aria-label="Search the network"
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
            setCursor(0)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 140)}
          onKeyDown={(event) => {
            if (hits.length === 0) return
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setCursor((current) => (current + 1) % hits.length)
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              setCursor((current) => (current - 1 + hits.length) % hits.length)
            }
            if (event.key === 'Enter') {
              event.preventDefault()
              go(hits[cursor])
            }
            if (event.key === 'Escape') setOpen(false)
          }}
        />
      </div>

      {open && hits.length > 0 ? (
        <ul className="hubsearch-results">
          {hits.map((target, index) => (
            <li key={target.href}>
              <a
                href={target.href}
                className="hubsearch-hit"
                data-cursor={index === cursor ? 'true' : undefined}
                onMouseEnter={() => setCursor(index)}
              >
                {target.icon ? (
                  <img src={target.icon} alt="" className="hubsearch-art" loading="lazy" />
                ) : (
                  <span className="hubsearch-art hubsearch-art-blank" aria-hidden="true" />
                )}
                <span className="hubsearch-text">
                  <strong>{target.label}</strong>
                  <span className="note">{target.sub}</span>
                </span>
                <span className="chip">{target.kind === 'wiki' ? 'Wiki' : 'Guide'}</span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
