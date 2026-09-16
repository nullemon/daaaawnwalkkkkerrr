'use client'

import { useState } from 'react'

type Status = 'idle' | 'sending' | 'sent' | 'error'

const KINDS = [
  { value: 'feature', label: 'A new feature or tool' },
  { value: 'data', label: 'Data we are missing' },
  { value: 'guide', label: 'A guide you want written' },
  { value: 'usability', label: 'Something that is hard to use' },
  { value: 'bug', label: 'Something is broken' },
  { value: 'other', label: 'Something else' },
]

/**
 * Posts into the requests collection, which is publicly writable and privately
 * readable — the same shape as the corrections form, and for the same reason.
 *
 * Kept separate from that form because the two queues need different triage: a
 * correction is checked against a source, a request is weighed against whether
 * it is worth building. Merging them buries the accuracy reports.
 */
export function RequestForm() {
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    setStatus('sending')
    setError('')

    try {
      const response = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: data.get('summary'),
          detail: data.get('detail'),
          kind: data.get('kind'),
          email: data.get('email') || undefined,
          pageUrl: typeof window !== 'undefined' ? window.location.href : undefined,
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

  if (status === 'sent') {
    return (
      <div className="callout">
        <h2>Thank you — that is on the list</h2>
        <p>
          Every request is read. The ones asked for most often get built first, which is the only
          fair way to order a queue when there is more to do than time to do it in.
        </p>
        <button type="button" className="linkish" onClick={() => setStatus('idle')}>
          Ask for something else
        </button>
      </div>
    )
  }

  return (
    <form className="checker-panel" onSubmit={onSubmit}>
      <div className="field">
        <label htmlFor="request-kind">What kind of thing is this?</label>
        <select id="request-kind" name="kind" defaultValue="feature">
          {KINDS.map((kind) => (
            <option key={kind.value} value={kind.value}>
              {kind.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="request-summary">What would you like?</label>
        <input
          id="request-summary"
          name="summary"
          required
          maxLength={200}
          placeholder="e.g. let me filter quests by which ending they feed"
        />
      </div>

      <div className="field">
        <label htmlFor="request-detail">Any detail that would help</label>
        <textarea
          id="request-detail"
          name="detail"
          rows={5}
          maxLength={2000}
          placeholder="What you were trying to do, and what got in the way."
        />
      </div>

      <div className="field">
        <label htmlFor="request-email">Your email, if you want a reply</label>
        <input id="request-email" name="email" type="email" placeholder="Optional" />
        <p className="note">
          Only used to reply about this request. Never added to a list and never passed on.
        </p>
      </div>

      <button type="submit" className="button" disabled={status === 'sending'}>
        {status === 'sending' ? 'Sending…' : 'Send request'}
      </button>

      {status === 'error' ? (
        <p className="note" role="alert">
          That did not send — {error}. Try again, or email us instead.
        </p>
      ) : null}
    </form>
  )
}
