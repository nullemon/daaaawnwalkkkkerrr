'use client'

import { useCallback, useEffect, useState } from 'react'

type Comment = {
  id: string | number
  body: string
  authorName?: string | null
  createdAt: string
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
 */
export function Comments({ pageUrl, gameId }: { pageUrl: string; gameId?: number | string }) {
  const [comments, setComments] = useState<Comment[] | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const query = new URLSearchParams({
        'where[pageUrl][equals]': pageUrl,
        'where[status][equals]': 'approved',
        sort: 'createdAt',
        limit: '100',
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
        }),
      })
      if (!response.ok) throw new Error(`Server returned ${response.status}`)
      setStatus('sent')
      form.reset()
    } catch (caught) {
      setStatus('error')
      setError(caught instanceof Error ? caught.message : 'Something went wrong.')
    }
  }

  return (
    <section className="section comments" id="comments">
      <div className="section-head">
        <h2>Comments</h2>
        <p className="note">
          Every comment is read by an editor before it appears, so yours will not show up straight
          away. Links are removed automatically — if you have a source, describe where it is and we
          will find it.
        </p>
      </div>

      {comments === null ? (
        <p className="note">Loading…</p>
      ) : comments.length === 0 ? (
        <p className="note">Nothing here yet. Be the first.</p>
      ) : (
        <ul className="comment-list">
          {comments.map((comment) => (
            <li key={comment.id} className="comment">
              <p className="comment-meta">
                <span className="comment-author">{comment.authorName?.trim() || 'Anonymous'}</span>
                <time dateTime={comment.createdAt}>
                  {new Date(comment.createdAt).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </time>
              </p>
              <p className="comment-body">{comment.body}</p>
            </li>
          ))}
        </ul>
      )}

      {status === 'sent' ? (
        <div className="callout">
          <h3>Thank you — that is with a moderator</h3>
          <p>
            It will appear once an editor has read it. We approve by hand, which is slower and is
            the reason this section is worth reading.
          </p>
          <button type="button" className="linkish" onClick={() => setStatus('idle')}>
            Write another
          </button>
        </div>
      ) : (
        <form className="checker-panel comment-form" onSubmit={onSubmit}>
          <label>
            <span>Your name</span>
            <input
              name="authorName"
              type="text"
              maxLength={60}
              autoComplete="nickname"
              placeholder="Optional"
            />
          </label>
          <label>
            <span>Your comment</span>
            <textarea
              name="body"
              rows={4}
              required
              maxLength={4000}
              placeholder="Corrections, things we have missed, or what happened on your run."
            />
          </label>
          <div className="comment-actions">
            <button type="submit" className="button" disabled={status === 'sending'}>
              {status === 'sending' ? 'Sending…' : 'Post comment'}
            </button>
            {status === 'error' ? <span className="note">{error}</span> : null}
          </div>
        </form>
      )}
    </section>
  )
}
