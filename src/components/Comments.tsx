'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useUi } from './UiStrings'
import type { Ui } from '@/lib/ui-registry'

type Comment = {
  id: string | number
  body: string
  authorName?: string | null
  createdAt: string
  parent?: string | number | { id: string | number } | null
}

type Status = 'idle' | 'sending' | 'sent' | 'error'

/**
 * The comment thread.
 *
 * Fetched at runtime rather than rendered into the static page, which is the
 * one thing that makes moderation workable: approving a comment in the admin
 * puts it on the page immediately, instead of at the next deploy. The page
 * itself stays static, and a reader who never scrolls this far never makes the
 * request.
 *
 * The endpoint is Payload's own REST API. Its access rule returns a `Where`
 * for anyone who is not an editor, so this cannot see anything but approved
 * comments no matter what it asks for — the filter below is for efficiency,
 * not for safety.
 *
 * ## The shape
 *
 * It was a heading, a list of bare paragraphs, and a form at the bottom, and
 * it read as a guestbook bolted to the end of the page. Three things fix that
 * and none of them is decoration: a face beside each name so the eye can find
 * where one comment ends and the next begins; a time somebody can parse
 * without arithmetic; and the box to write in at the top, where the people who
 * came to say something will look for it.
 *
 * Replies go one level deep. Flat turns every disagreement into people quoting
 * each other by name; unlimited nesting eats the column on a phone until the
 * argument at the bottom is four words wide.
 */

/** A stable colour per name, so the same person looks the same down a thread. */
const AVATAR_HUES = [210, 262, 330, 12, 34, 96, 160, 190]

function avatarFor(name: string) {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0])
      .join('')
      .toUpperCase() || '?'
  return { initials, hue: AVATAR_HUES[hash % AVATAR_HUES.length] }
}

/**
 * "3 days ago", falling back to a date once that stops being useful.
 *
 * Relative time is easier to read for anything recent and actively worse for
 * anything old — "412 days ago" is a number somebody has to do sums with.
 */
const RELATIVE: [number, Intl.RelativeTimeFormatUnit][] = [
  [60, 'second'],
  [3600, 'minute'],
  [86400, 'hour'],
  [604800, 'day'],
]

function when(iso: string, ui: Ui) {
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return { label: iso, exact: iso }

  const exact = then.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  const seconds = (Date.now() - then.getTime()) / 1000
  if (seconds < 45) return { label: ui.t('comments.just-now'), exact }

  const format = new Intl.RelativeTimeFormat('en-GB', { numeric: 'auto' })
  let divisor = 1
  for (const [limit, unit] of RELATIVE) {
    if (seconds < limit) return { label: format.format(-Math.round(seconds / divisor), unit), exact }
    divisor = limit
  }

  return {
    label: then.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    exact,
  }
}

const parentIdOf = (comment: Comment) => {
  const parent = comment.parent
  if (!parent) return null
  return typeof parent === 'object' ? String(parent.id) : String(parent)
}

export function Comments({ pageUrl, gameId }: { pageUrl: string; gameId?: number | string }) {
  const ui = useUi()
  const [comments, setComments] = useState<Comment[] | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const [newest, setNewest] = useState(true)
  const [replyTo, setReplyTo] = useState<Comment | null>(null)

  const load = useCallback(async () => {
    try {
      const query = new URLSearchParams({
        'where[pageUrl][equals]': pageUrl,
        'where[status][equals]': 'approved',
        sort: 'createdAt',
        limit: '200',
        depth: '0',
      })
      const response = await fetch(`/api/comments?${query}`)
      if (!response.ok) throw new Error(String(response.status))
      const data = (await response.json()) as { docs?: Comment[] }
      setComments(data.docs ?? [])
    } catch {
      // A thread that will not load is not worth an error message on an
      // otherwise complete page. It renders as "no comments yet" and the
      // reader loses nothing they came for.
      setComments([])
    }
  }, [pageUrl])

  useEffect(() => {
    void load()
  }, [load])

  /* Top-level comments, each with its replies in the order they were written. */
  const threads = useMemo(() => {
    const all = comments ?? []
    const replies = new Map<string, Comment[]>()
    for (const comment of all) {
      const parent = parentIdOf(comment)
      if (!parent) continue
      replies.set(parent, [...(replies.get(parent) ?? []), comment])
    }

    const roots = all.filter((comment) => {
      const parent = parentIdOf(comment)
      // A reply whose parent is not approved (or was deleted) would otherwise
      // vanish. It reads perfectly well as a top-level comment, so promote it
      // rather than dropping something a moderator has already approved.
      return !parent || !all.some((other) => String(other.id) === parent)
    })

    const ordered = newest ? [...roots].reverse() : roots
    return ordered.map((root) => ({
      comment: root,
      replies: replies.get(String(root.id)) ?? [],
    }))
  }, [comments, newest])

  const total = comments?.length ?? 0

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    setStatus('sending')
    setError('')

    try {
      const response = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: data.get('body'),
          authorName: data.get('authorName') || undefined,
          pageUrl,
          game: gameId,
          parent: replyTo?.id,
        }),
      })
      if (!response.ok) throw new Error(`Server returned ${response.status}`)
      setStatus('sent')
      setReplyTo(null)
      form.reset()
    } catch (caught) {
      setStatus('error')
      setError(caught instanceof Error ? caught.message : ui.t('account.error-generic'))
    }
  }

  const row = (comment: Comment, isReply: boolean) => {
    const name = comment.authorName?.trim() || ui.t('comments.anonymous')
    const avatar = avatarFor(name)
    const time = when(comment.createdAt, ui)

    return (
      <li key={comment.id} className="comment" data-reply={isReply ? 'true' : undefined}>
        <span
          className="comment-avatar"
          style={{ ['--hue' as string]: String(avatar.hue) }}
          aria-hidden="true"
        >
          {avatar.initials}
        </span>
        <div className="comment-main">
          <p className="comment-meta">
            <span className="comment-author">{name}</span>
            <time dateTime={comment.createdAt} title={time.exact}>
              {time.label}
            </time>
          </p>
          <p className="comment-body">{comment.body}</p>
          {!isReply ? (
            <button
              type="button"
              className="comment-reply"
              onClick={() => {
                setReplyTo(comment)
                setStatus('idle')
                document.getElementById('comment-box')?.focus()
              }}
            >
              {ui.t('comments.reply')}
            </button>
          ) : null}
        </div>
      </li>
    )
  }

  return (
    <section className="section comments" id="comments">
      <div className="section-head">
        <h2>
          {ui.t('comments.heading')}
          {total > 0 ? <span className="comment-count">{total}</span> : null}
        </h2>
        {total > 1 ? (
          <button type="button" className="comment-sort" onClick={() => setNewest((on) => !on)}>
            {newest ? ui.t('comments.sort-newest') : ui.t('comments.sort-oldest')}
          </button>
        ) : null}
      </div>

      <p className="comment-rule note">{ui.t('comments.rule')}</p>

      {/* The box first: the people who came to say something look for it here. */}
      {status === 'sent' ? (
        <div className="callout">
          <h2>{ui.t('comments.sent-title')}</h2>
          <p>{ui.t('comments.sent-body')}</p>
          <button type="button" className="linkish" onClick={() => setStatus('idle')}>
            {ui.t('comments.sent-again')}
          </button>
        </div>
      ) : (
        <form className="comment-form" onSubmit={onSubmit}>
          {replyTo ? (
            <p className="comment-replying">
              {ui.t('comments.replying-to')}{' '}
              <strong>{replyTo.authorName?.trim() || ui.t('comments.anonymous')}</strong>
              <button type="button" className="linkish" onClick={() => setReplyTo(null)}>
                {ui.t('form.cancel')}
              </button>
            </p>
          ) : null}

          <textarea
            id="comment-box"
            name="body"
            rows={3}
            required
            maxLength={4000}
            placeholder={
              replyTo ? ui.t('comments.reply-placeholder') : ui.t('comments.body-placeholder')
            }
          />
          <div className="comment-actions">
            <input
              name="authorName"
              type="text"
              maxLength={60}
              autoComplete="nickname"
              placeholder={ui.t('comments.name-placeholder')}
            />
            <button type="submit" className="button" disabled={status === 'sending'}>
              {status === 'sending'
                ? ui.t('form.sending')
                : replyTo
                  ? ui.t('comments.post-reply')
                  : ui.t('comments.post')}
            </button>
          </div>
          {status === 'error' ? <p className="note">{error}</p> : null}
        </form>
      )}

      {comments === null ? (
        <p className="note">{ui.t('comments.loading')}</p>
      ) : threads.length === 0 ? (
        <p className="comment-empty note">{ui.t('comments.empty')}</p>
      ) : (
        <ul className="comment-list">
          {threads.map(({ comment, replies }) => (
            <li key={comment.id} className="comment-thread">
              <ul className="comment-group">
                {row(comment, false)}
                {replies.map((reply) => row(reply, true))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
