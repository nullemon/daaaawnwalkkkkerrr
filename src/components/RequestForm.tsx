'use client'

import { useState } from 'react'
import { useUi } from './UiStrings'
import { fill } from '@/lib/copy'

type Status = 'idle' | 'sending' | 'sent' | 'error'

/** The stored values. Their wording is `request-kind.*` in the label registry. */
const KINDS = ['feature', 'data', 'guide', 'usability', 'bug', 'other']

/**
 * Posts into the requests collection, which is publicly writable and privately
 * readable — the same shape as the corrections form, and for the same reason.
 *
 * Kept separate from that form because the two queues need different triage: a
 * correction is checked against a source, a request is weighed against whether
 * it is worth building. Merging them buries the accuracy reports.
 */
export function RequestForm() {
  const ui = useUi()
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
      setError(caught instanceof Error ? caught.message : ui.t('account.error-generic'))
    }
  }

  if (status === 'sent') {
    return (
      <div className="callout">
        <h2>{ui.t('request.sent-title')}</h2>
        <p>{ui.t('request.sent-body')}</p>
        <button type="button" className="linkish" onClick={() => setStatus('idle')}>
          {ui.t('request.sent-again')}
        </button>
      </div>
    )
  }

  return (
    <form className="checker-panel" onSubmit={onSubmit}>
      <div className="field">
        <label htmlFor="request-kind">{ui.t('request.kind-label')}</label>
        <select id="request-kind" name="kind" defaultValue="feature">
          {KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {ui.label('request-kind', kind)}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="request-summary">{ui.t('request.summary-label')}</label>
        <input
          id="request-summary"
          name="summary"
          required
          maxLength={200}
          placeholder={ui.t('request.summary-placeholder')}
        />
      </div>

      <div className="field">
        <label htmlFor="request-detail">{ui.t('request.detail-label')}</label>
        <textarea
          id="request-detail"
          name="detail"
          rows={5}
          maxLength={2000}
          placeholder={ui.t('request.detail-placeholder')}
        />
      </div>

      <div className="field">
        <label htmlFor="request-email">{ui.t('request.email-label')}</label>
        <input
          id="request-email"
          name="email"
          type="email"
          placeholder={ui.t('request.email-placeholder')}
        />
        <p className="note">{ui.t('request.email-note')}</p>
      </div>

      <button type="submit" className="button" disabled={status === 'sending'}>
        {status === 'sending' ? ui.t('form.sending') : ui.t('request.submit')}
      </button>

      {status === 'error' ? (
        <p className="note" role="alert">
          {fill(ui.t('request.error'), { error })}
        </p>
      ) : null}
    </form>
  )
}
