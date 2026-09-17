'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import type { ReaderScore } from '@/lib/ratings'

/**
 * Ten stars. Hover to try one on, click to send it.
 *
 * ## No account, so the reader's own score lives in their browser
 *
 * The page is prerendered and the same HTML is served to everyone, so the
 * server cannot tell this component which star to fill in — the voter key is
 * computed inside `/api/rate` from a cookie the page never sees. The reader's
 * own score is therefore read from `localStorage` after mount, the same way
 * `RunProvider` does it. Reading it during render instead would be a
 * hydration mismatch on every page that has ever been voted on.
 *
 * That copy can disagree with the server — a different browser, cleared
 * storage — and when it does the server wins the moment they vote again,
 * because the unique index on `(game, voter)` makes the second vote a
 * correction. Nothing is double counted; the widget just forgets.
 *
 * ## Keyboard
 *
 * Arrow keys move along the row and preview as they go; Enter or Space sends
 * the focused star, which is a real `<button>` so that happens natively. Home
 * and End jump to 1 and 10. A rating widget that only answers a mouse is one
 * of the most common accessibility failures on the web and it is entirely
 * avoidable — ten buttons in a `radiogroup` with a roving tabindex is the
 * whole fix.
 *
 * ## Optimistic, and it rolls back out loud
 *
 * The star fill moves on click, before the round trip. The *average* does not:
 * it is replaced by the figure the endpoint returns, because guessing the new
 * mean means guessing whether this reader had already voted, and a total that
 * jumps and then corrects itself looks like the site cannot count. On failure
 * the fill returns to what it was and a line says the vote did not save —
 * silently reverting would read as a click that missed.
 *
 * ## Strings
 *
 * These are props with defaults rather than `useUi()` keys, which is a
 * deviation from the house rule in `lib/ui-registry.ts` and a deliberate one:
 * this component landed while that file was being edited elsewhere, and an
 * unknown key renders as the key itself — `rating.thanks` in place of a
 * sentence. When the registry is free, add `rating.prompt`, `rating.yours`,
 * `rating.none`, `rating.from` and `rating.failed` and delete these defaults.
 */

const STARS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const

const STORAGE_PREFIX = 'dw-rating-'

export type StarRatingProps = {
  /** Slug or id. Sent to `/api/rate`, which accepts either. */
  game: string | number
  /**
   * The aggregate as of the last build. Optional so a caller with nothing to
   * show can still render the widget — it will say so rather than say zero.
   */
  readers?: ReaderScore
  /** Show the score without collecting one. Renders no buttons at all. */
  readOnly?: boolean
  /**
   * Ask `/api/rate` for the live aggregate on mount.
   *
   * Off by default: every page here is static, and a page that renders this in
   * a list of eight games should not fire eight requests to freshen a number
   * nobody is looking at. Worth turning on where the score is the point.
   */
  refresh?: boolean
  labels?: Partial<typeof DEFAULT_LABELS>
}

const DEFAULT_LABELS = {
  prompt: 'Rate this game out of 10',
  yours: 'Your rating',
  none: 'No reader scores yet',
  one: 'reader',
  many: 'readers',
  failed: 'That vote did not save. Try again?',
  saving: 'Saving…',
}

const plural = (count: number, labels: typeof DEFAULT_LABELS) =>
  count === 1 ? labels.one : labels.many

/** One star. `filled` is the visual state; the value is what it means. */
const Star = ({ filled }: { filled: boolean }) => (
  <Icon name="star" size={22} className="rating-star" fill={filled ? 'currentColor' : 'none'} />
)

export function StarRating({
  game,
  readers,
  readOnly = false,
  refresh = false,
  labels: given,
}: StarRatingProps) {
  const labels = { ...DEFAULT_LABELS, ...given }

  const [score, setScore] = useState<ReaderScore>(readers ?? { average: null, votes: 0 })
  const [mine, setMine] = useState<number | null>(null)
  /* Whichever star the pointer or the keyboard is currently over. */
  const [preview, setPreview] = useState<number | null>(null)
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle')

  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const storageKey = `${STORAGE_PREFIX}${game}`

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey)
      const parsed = raw ? Number(raw) : NaN
      if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 10) setMine(parsed)
    } catch {
      // Blocked or corrupt storage means we do not know their score. That is a
      // widget with no star filled in, not a broken one.
    }
  }, [storageKey])

  /* The build-time figure is a floor, not a lie — but it never moves on its own. */
  useEffect(() => {
    if (!refresh) return
    let cancelled = false
    fetch(`/api/rate?game=${encodeURIComponent(String(game))}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (!cancelled && body?.readers) setScore(body.readers as ReaderScore)
      })
      .catch(() => {
        // The prerendered number is still a real number. Keep it.
      })
    return () => {
      cancelled = true
    }
  }, [game, refresh])

  const submit = useCallback(
    async (value: number) => {
      const previous = mine
      setMine(value)
      setStatus('saving')

      try {
        const response = await fetch('/api/rate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // The cookie half of the voter key is set by this response and read
          // by the next one, so it has to be allowed to travel.
          credentials: 'include',
          body: JSON.stringify({ game, score: value }),
        })
        if (!response.ok) throw new Error(String(response.status))
        const body = (await response.json()) as { readers?: ReaderScore }
        if (body.readers) setScore(body.readers)
        setStatus('idle')
        try {
          window.localStorage.setItem(storageKey, String(value))
        } catch {
          // The vote is stored server-side either way; this only decides
          // whether the star is still filled in after a reload.
        }
      } catch {
        setMine(previous)
        setStatus('error')
      }
    },
    [game, mine, storageKey],
  )

  /* Arrow keys move focus and preview together — the preview is the feedback. */
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const from = preview ?? mine ?? 1
    let next: number | null = null

    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = Math.max(1, from - 1)
    else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = Math.min(10, from + 1)
    else if (event.key === 'Home') next = 1
    else if (event.key === 'End') next = 10
    if (next === null) return

    event.preventDefault()
    setPreview(next)
    buttons.current[next - 1]?.focus()
  }

  const shown = preview ?? mine ?? 0

  const summary =
    score.average === null || score.votes === 0 ? (
      /* Never "0 / 10". Nobody has voted; that is not a verdict of nothing. */
      <span className="rating-empty">{labels.none}</span>
    ) : (
      <>
        <b className="rating-average">{score.average.toFixed(1)}</b>
        <span className="rating-outof">/ 10</span>
        <span className="rating-votes">
          {score.votes} {plural(score.votes, labels)}
        </span>
      </>
    )

  if (readOnly) {
    const label =
      score.average === null
        ? labels.none
        : `${score.average.toFixed(1)} out of 10, from ${score.votes} ${plural(score.votes, labels)}`
    /*
      The average is fractional and the stars should be too, so a solid row is
      laid over an outline row and clipped to the percentage. Whole stars would
      round 7.4 and 6.6 to the same picture.
    */
    const fill = score.average === null ? 0 : (score.average / 10) * 100

    return (
      <div className="rating rating-static">
        <span className="rating-stars" role="img" aria-label={label}>
          <span className="rating-layer" aria-hidden="true">
            {STARS.map((value) => (
              <Star key={value} filled={false} />
            ))}
          </span>
          <span
            className="rating-layer rating-layer-on"
            style={{ ['--fill' as string]: `${fill}%` }}
            aria-hidden="true"
          >
            {STARS.map((value) => (
              <Star key={value} filled />
            ))}
          </span>
        </span>
        <span className="rating-summary">{summary}</span>
      </div>
    )
  }

  return (
    <div className="rating">
      <div
        className="rating-stars rating-input"
        role="radiogroup"
        aria-label={labels.prompt}
        onKeyDown={onKeyDown}
        onMouseLeave={() => setPreview(null)}
        onBlur={(event) => {
          // Only when focus has left the row entirely, or moving between
          // stars would flicker the preview off and on again.
          if (!event.currentTarget.contains(event.relatedTarget)) setPreview(null)
        }}
      >
        {STARS.map((value) => (
          <button
            key={value}
            type="button"
            ref={(node) => {
              buttons.current[value - 1] = node
            }}
            className="rating-button"
            role="radio"
            aria-checked={mine === value}
            aria-label={`${value} out of 10`}
            /* Roving tabindex: one stop for the whole row, not ten. */
            tabIndex={value === (preview ?? mine ?? 1) ? 0 : -1}
            data-on={value <= shown ? 'true' : undefined}
            data-mine={mine !== null && value <= mine ? 'true' : undefined}
            disabled={status === 'saving'}
            onMouseEnter={() => setPreview(value)}
            onFocus={() => setPreview(value)}
            onClick={() => void submit(value)}
          >
            <Star filled={value <= shown} />
          </button>
        ))}
      </div>

      <p className="rating-summary">
        {mine !== null ? (
          <span className="rating-mine">
            {labels.yours}: <b>{mine}</b> / 10
          </span>
        ) : null}
        {summary}
      </p>

      {status === 'saving' ? <p className="rating-note note">{labels.saving}</p> : null}
      {status === 'error' ? (
        <p className="rating-note rating-failed" role="status">
          {labels.failed}
        </p>
      ) : null}
    </div>
  )
}
