'use client'

import { useState } from 'react'
import { useUi } from './UiStrings'
import { fill } from '@/lib/copy'

type Status = 'idle' | 'sending' | 'sent' | 'error'

/**
 * Posts straight into the corrections collection, which is publicly writable
 * and privately readable. This is the mechanism that turns the site's central
 * weakness — data compiled without access to the game — into something that
 * gets better rather than staying wrong.
 *
 * Every sentence here comes from the interface-text registry. The summary
 * placeholder is why: it named a Dawnwalker quest, and this form is on all
 * eight wikis.
 */
export function CorrectionForm() {
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
      setError(caught instanceof Error ? caught.message : ui.t('account.error-generic'))
    }
  }

  if (status === 'sent') {
    return (
      <div className="callout">
        <h2>{ui.t('correction.sent-title')}</h2>
        <p>{ui.t('correction.sent-body')}</p>
        <button type="button" className="linkish" onClick={() => setStatus('idle')}>
          {ui.t('correction.sent-again')}
        </button>
      </div>
    )
  }

  return (
    <form className="checker-panel" onSubmit={onSubmit}>
      <div className="field">
        <label htmlFor="correction-summary">{ui.t('correction.summary-label')}</label>
        <input
          id="correction-summary"
          name="summary"
          required
          maxLength={200}
          placeholder={ui.t('correction.summary-placeholder')}
        />
      </div>
      <div className="field">
        <label htmlFor="correction-detail">{ui.t('correction.detail-label')}</label>
        <textarea id="correction-detail" name="detail" rows={4} maxLength={2000} />
      </div>
      <div className="field">
        <label htmlFor="correction-source">{ui.t('correction.source-label')}</label>
        <input
          id="correction-source"
          name="sourceUrl"
          type="url"
          placeholder={ui.t('correction.source-placeholder')}
        />
      </div>
      <div>
        <button type="submit" className="button" disabled={status === 'sending'}>
          {status === 'sending' ? ui.t('form.sending') : ui.t('correction.submit')}
        </button>
      </div>
      {status === 'error' ? (
        <p className="note" role="alert">
          {fill(ui.t('correction.error'), { error })}
        </p>
      ) : null}
    </form>
  )
}
