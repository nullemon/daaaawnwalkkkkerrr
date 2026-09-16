'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Icon } from './Icon'
import { useUi } from './UiStrings'
import { fill } from '@/lib/copy'

/**
 * Tick off what you have earned; see what is left and how hard it gets.
 *
 * ## Why this and not a build planner
 *
 * A build planner needs damage numbers, scaling curves and a skill tree. None
 * of that is published for these games, and a planner built on invented
 * figures is worse than no planner — it would be the one tool on the site
 * giving confidently wrong answers, on a network whose entire pitch is that it
 * does not do that.
 *
 * The achievement data is real: every entry carries the developer's own
 * description and the platform's global unlock rate. That supports a tool that
 * genuinely answers something — not "what should I build", but "what is
 * actually left, and which of it is going to be the problem". Dawnwalker's run
 * checker is the same idea against a different dataset.
 *
 * Progress is kept in this browser. No account, no sync, nothing sent
 * anywhere — which is also why it has to tolerate `localStorage` being
 * unavailable, in a private window or with site data blocked.
 */

export type TrackedAchievement = {
  id: string | number
  title: string
  slug: string
  description?: string | null
  rarity?: string | null
  globalPercent?: number | null
  hidden?: boolean | null
}

/*
  The wording is `achievement-rarity.*` in the interface-text registry. It used
  to be a `RARITY_LABEL` const here, another in the achievements index and a
  third on the achievement page — three copies of one map, which is what the
  registry exists to stop. The order below is a display decision, not wording,
  so it stays.
*/
const RARITY_ORDER = ['ultra-rare', 'very-rare', 'rare', 'uncommon', 'common']

type Filter = 'all' | 'todo' | 'done' | 'hardest' | 'hidden'

export function CompletionTracker({
  game,
  achievements,
}: {
  game: string
  achievements: TrackedAchievement[]
}) {
  const ui = useUi()
  const storageKey = `completion:${game}`

  const [earned, setEarned] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<Filter>('todo')
  const [query, setQuery] = useState('')
  const [ready, setReady] = useState(false)

  // Read once on mount. Server and first client render must agree, so nothing
  // depends on storage until after hydration.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey)
      if (saved) setEarned(new Set(JSON.parse(saved) as string[]))
    } catch {
      // Private window, or site data blocked. The tool still works, it just
      // forgets between visits — which is better than not rendering.
    }
    setReady(true)
  }, [storageKey])

  useEffect(() => {
    if (!ready) return
    try {
      window.localStorage.setItem(storageKey, JSON.stringify([...earned]))
    } catch {
      /* Nothing to do. Losing the save is not worth an error on the page. */
    }
  }, [earned, ready, storageKey])

  const toggle = (slug: string) =>
    setEarned((current) => {
      const next = new Set(current)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })

  const stats = useMemo(() => {
    const done = achievements.filter((entry) => earned.has(entry.slug))
    const left = achievements.filter((entry) => !earned.has(entry.slug))

    /*
      The headline figure is not "42 of 141". It is what is left weighted by
      how rare it is: finishing the last five ultra-rares is most of the work,
      and a plain count says you are 96% done while you are staring at it.
    */
    const difficulty = (entry: TrackedAchievement) => {
      const percent = entry.globalPercent
      if (percent === null || percent === undefined) return 1
      // A 1% achievement counts for a hundred times a 100% one.
      return Math.min(100, 100 / Math.max(percent, 1))
    }

    const totalWeight = achievements.reduce((sum, entry) => sum + difficulty(entry), 0)
    const doneWeight = done.reduce((sum, entry) => sum + difficulty(entry), 0)

    const hardestLeft = [...left]
      .filter((entry) => typeof entry.globalPercent === 'number')
      .sort((a, b) => (a.globalPercent ?? 100) - (b.globalPercent ?? 100))[0]

    return {
      done: done.length,
      total: achievements.length,
      percent: achievements.length ? Math.round((done.length / achievements.length) * 100) : 0,
      effort: totalWeight ? Math.round((doneWeight / totalWeight) * 100) : 0,
      hardestLeft,
      byRarity: RARITY_ORDER.map((rarity) => ({
        rarity,
        label: ui.label('achievement-rarity', rarity),
        total: achievements.filter((entry) => entry.rarity === rarity).length,
        done: done.filter((entry) => entry.rarity === rarity).length,
      })).filter((row) => row.total > 0),
    }
  }, [achievements, earned, ui])

  const shown = useMemo(() => {
    const text = query.trim().toLowerCase()
    let rows = achievements

    if (filter === 'todo') rows = rows.filter((entry) => !earned.has(entry.slug))
    if (filter === 'done') rows = rows.filter((entry) => earned.has(entry.slug))
    if (filter === 'hidden') rows = rows.filter((entry) => entry.hidden)
    if (filter === 'hardest') {
      rows = rows
        .filter((entry) => !earned.has(entry.slug) && typeof entry.globalPercent === 'number')
        .sort((a, b) => (a.globalPercent ?? 100) - (b.globalPercent ?? 100))
        .slice(0, 20)
    }

    if (text) {
      rows = rows.filter(
        (entry) =>
          entry.title.toLowerCase().includes(text) ||
          (entry.description ?? '').toLowerCase().includes(text),
      )
    }

    return rows
  }, [achievements, earned, filter, query])

  const FILTERS: { key: Filter; label: string }[] = [
    {
      key: 'todo',
      label: fill(ui.t('tracker.still-to-do'), { count: stats.total - stats.done }),
    },
    { key: 'hardest', label: ui.t('tracker.hardest-left') },
    { key: 'hidden', label: ui.t('tracker.hidden') },
    { key: 'done', label: fill(ui.t('tracker.earned'), { count: stats.done }) },
    { key: 'all', label: ui.t('tracker.all') },
  ]

  return (
    <div className="tracker">
      <div className="tracker-summary">
        <div className="tracker-figure">
          <span className="tracker-big">{stats.percent}%</span>
          <span className="note">
            {fill(ui.t('tracker.earned-of'), { done: stats.done, total: stats.total })}
          </span>
          <span className="tracker-bar" aria-hidden="true">
            <span style={{ width: `${stats.percent}%` }} />
          </span>
        </div>

        <div className="tracker-figure">
          <span className="tracker-big">{stats.effort}%</span>
          <span className="note">{ui.t('tracker.effort')}</span>
          <span className="tracker-bar tracker-bar-alt" aria-hidden="true">
            <span style={{ width: `${stats.effort}%` }} />
          </span>
        </div>

        {stats.hardestLeft ? (
          <div className="tracker-figure tracker-next">
            <span className="eyebrow">{ui.t('tracker.hardest-one-left')}</span>
            <Link href={`/achievements/${stats.hardestLeft.slug}`}>{stats.hardestLeft.title}</Link>
            <span className="note">
              {fill(ui.t('tracker.have-it'), { percent: stats.hardestLeft.globalPercent })}
            </span>
          </div>
        ) : null}
      </div>

      <p className="note">{ui.t('tracker.two-figures')}</p>

      <div className="tracker-rarity">
        {stats.byRarity.map((row) => (
          <span key={row.rarity} className="chip" data-rarity={row.rarity}>
            {row.label}: {row.done}/{row.total}
          </span>
        ))}
      </div>

      <div className="tracker-controls">
        <div className="tracker-filters">
          {FILTERS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              className="tracker-tab"
              aria-pressed={filter === entry.key}
              onClick={() => setFilter(entry.key)}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <label className="tracker-search">
          <span className="visually-hidden">{ui.t('tracker.search-label')}</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={ui.t('tracker.search-placeholder')}
          />
        </label>
      </div>

      {shown.length === 0 ? (
        <p className="note">
          {filter === 'todo' && stats.done === stats.total
            ? ui.t('tracker.all-done')
            : ui.t('tracker.no-match')}
        </p>
      ) : (
        <ul className="tracker-list">
          {shown.map((entry) => {
            const done = earned.has(entry.slug)
            return (
              <li key={entry.id} className="tracker-row" data-done={done ? 'true' : undefined}>
                <label className="tracker-check">
                  <input type="checkbox" checked={done} onChange={() => toggle(entry.slug)} />
                  <span className="tracker-box" aria-hidden="true">
                    {done ? <Icon name="check" size={13} /> : null}
                  </span>
                  <span className="tracker-name">
                    <Link href={`/achievements/${entry.slug}`}>{entry.title}</Link>
                    <span className="note">
                      {entry.hidden && !entry.description
                        ? ui.t('tracker.hidden-desc')
                        : entry.description}
                    </span>
                  </span>
                </label>
                <span className="tracker-rate">
                  {typeof entry.globalPercent === 'number' ? `${entry.globalPercent}%` : '—'}
                </span>
              </li>
            )
          })}
        </ul>
      )}

      <p className="note">{ui.t('tracker.local-note')}</p>
    </div>
  )
}
