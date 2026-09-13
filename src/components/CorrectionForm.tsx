'use client'

import { useState } from 'react'

type Status = 'idle' | 'sending' | 'sent' | 'error'

/**
 * Posts straight into the corrections collection, which is publicly writable
 * and privately readable. This is the mechanism that turns the site's central
 * weakness — data compiled without access to the game — into something that
 * gets better rather than staying wrong.
 */
export function CorrectionForm() {
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    setStatus('sending')
    setError('')

    try {
      const response = await fetch('/api/corrections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: data.get('summary'),
          detail: data.get('detail'),
          sourceUrl: data.get('sourceUrl'),
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
        <h3>Thank you — that is in the queue</h3>
        <p>
          We read every report. If it checks out, the page is corrected and the confidence rating
          goes up with it.
        </p>
        <button type="button" className="linkish" onClick={() => setStatus('idle')}>
          Report something else
        </button>
      </div>
    )
  }

  return (
    <form className="checker-panel" onSubmit={onSubmit}>
      <div className="field">
        <label htmlFor="correction-summary">What is wrong?</label>
        <input
          id="correction-summary"
          name="summary"
          required
          maxLength={200}
          placeholder="e.g. Hive and Seek costs 3 segments, not unknown"
        />
      </div>
      <div className="field">
        <label htmlFor="correction-detail">Any detail you can give</label>
        <textarea id="correction-detail" name="detail" rows={4} maxLength={2000} />
      </div>
      <div className="field">
        <label htmlFor="correction-source">Source, if you have one</label>
        <input id="correction-source" name="sourceUrl" type="url" placeholder="https://" />
      </div>
      <div>
        <button type="submit" className="button" disabled={status === 'sending'}>
          {status === 'sending' ? 'Sending…' : 'Send correction'}
        </button>
      </div>
      {status === 'error' ? (
        <p className="note" role="alert">
          That did not send: {error}. Try again in a moment.
        </p>
      ) : null}
    </form>
  )
}
