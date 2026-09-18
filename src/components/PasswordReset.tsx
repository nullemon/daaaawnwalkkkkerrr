'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useUi } from './UiStrings'

/**
 * Forgotten-password and password-reset, for **reader** accounts.
 *
 * Two auth collections live in this app and their tokens are not
 * interchangeable. `users` are editors and reset inside `/admin`, against the
 * `users` collection. `players` are readers with an optional account, and
 * everything here talks to `/api/players/...` and nothing else — a token from
 * one collection is refused by the other, so there is no path from either form
 * into the wrong one. That was the bug: Payload exposes
 * `POST /api/players/forgot-password` whether anything links to it or not, and
 * with no template on the collection the link it composed pointed at
 * `/admin/reset/<token>`, where a reader was told the token was invalid on a
 * page they cannot sign into.
 *
 * `/api` is in `PASS_THROUGH` in `proxy.ts`, so these requests resolve
 * identically on all ten hosts — which matters, because `ForgotPasswordForm`
 * is inside `AccountPanel` and that renders on a wiki's run page as well as on
 * the hub. The *page* is another matter: `account` is in `APEX_ONLY`, so
 * `/account/reset` exists on the hub alone and the email links to it
 * absolutely. See `resetUrl` in `src/collections/Players.ts`.
 *
 * Every sentence comes from the interface-text registry rather than being
 * typed in here, for the reason `CorrectionForm` gives: these components are
 * on eight wikis and a sentence in a component is a sentence on all of them.
 */

type Status = 'idle' | 'sending' | 'sent' | 'error'

/**
 * Ask for a reset link.
 *
 * The answer is the same whether or not the address has an account, and the
 * request is not even checked for failure in a way the reader can see: a form
 * that said "no such account" would be a way of asking whether a named person
 * reads this site. Payload's endpoint answers 200 either way for the same
 * reason, so there is nothing here to give away — only a network failure is
 * reported, because that one is about us rather than about them.
 */
export function ForgotPasswordForm({ onBack }: { onBack?: () => void }) {
  const ui = useUi()
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setStatus('sending')
    setError('')
    try {
      const response = await fetch('/api/players/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: String(data.get('email') ?? '') }),
      })
      /*
        A 4xx here is a malformed address or a rate limit, not "no such
        account" — Payload does not distinguish, deliberately. Reported as a
        send failure rather than interpreted, because guessing which it was is
        how a form starts leaking the answer it was written not to give.
      */
      if (!response.ok) throw new Error(`Server returned ${response.status}`)
      setStatus('sent')
    } catch {
      setStatus('error')
      setError(ui.t('account.error-forgot'))
    }
  }

  if (status === 'sent') {
    return (
      <div className="callout">
        <h2>{ui.t('account.forgot-sent-title')}</h2>
        <p>{ui.t('account.forgot-sent-body')}</p>
        {onBack ? (
          <button type="button" className="linkish" onClick={onBack}>
            {ui.t('account.forgot-back')}
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="stack-sm">
      <p className="note">{ui.t('account.forgot-note')}</p>
      <div className="field">
        <label htmlFor="forgot-email">{ui.t('account.email-label')}</label>
        <input id="forgot-email" name="email" type="email" required autoComplete="email" />
      </div>
      <div className="field-row">
        <button type="submit" className="button" disabled={status === 'sending'}>
          {status === 'sending' ? ui.t('form.sending') : ui.t('account.forgot-submit')}
        </button>
        {onBack ? (
          <button type="button" className="linkish" onClick={onBack}>
            {ui.t('account.forgot-back')}
          </button>
        ) : null}
      </div>
      {status === 'error' ? (
        <p className="note" role="alert" style={{ color: 'var(--risk)' }}>
          {error}
        </p>
      ) : null}
    </form>
  )
}

/**
 * The page a reset link lands on.
 *
 * ## Where the token comes from
 *
 * The fragment first (`/account/reset#token=…`), the query string second. The
 * email sends the fragment because a fragment is never transmitted to a
 * server: it stays out of the access log, out of any Referer, and out of
 * `Beacon`, which posts `window.location.search` to `/api/hit` on every page
 * view. The query string is still accepted because a mail gateway that
 * rewrites links can drop a fragment, and a reader in that position would
 * otherwise be permanently stuck — every fresh link they asked for would lose
 * it the same way.
 *
 * Read from `window.location` in an effect rather than through
 * `useSearchParams`, for two reasons. `useSearchParams` cannot see a fragment
 * at all, which is the form we actually send; and it opts the route out of
 * being fully prerendered unless it is wrapped in a Suspense boundary. Every
 * public page on this network is static HTML, and there is no reason for this
 * one to be the exception: the token is a browser-side secret and the page is
 * the same bytes for everybody.
 */
export function ResetPasswordPanel() {
  const ui = useUi()
  const [token, setToken] = useState('')
  const [ready, setReady] = useState(false)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')

  useEffect(() => {
    if (typeof window === 'undefined') return
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const query = new URLSearchParams(window.location.search)
    setToken((hash.get('token') ?? query.get('token') ?? '').trim())
    setReady(true)
  }, [])

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const password = String(data.get('password') ?? '')
    const repeat = String(data.get('repeat') ?? '')

    /*
      Checked here because there is nothing to check it against on the server:
      Payload takes one password and sets it. A typo in a field the reader
      cannot see the contents of locks them out of the account they were in the
      middle of recovering, and the only way back is another email.
    */
    if (password !== repeat) {
      setStatus('error')
      setError(ui.t('account.reset-mismatch'))
      return
    }

    setStatus('sending')
    setError('')
    try {
      const response = await fetch('/api/players/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The response sets the session cookie, so the reader is signed in
        // where they already are rather than being asked to log in again.
        credentials: 'include',
        body: JSON.stringify({ token, password }),
      })
      if (!response.ok) throw new Error(`Server returned ${response.status}`)
      setStatus('sent')
    } catch {
      setStatus('error')
      setError(ui.t('account.error-reset'))
    }
  }

  /* Nothing at all until the token has been read, so the no-token state never
     flashes up in front of a reader whose link was perfectly good. */
  if (!ready) return <p className="note">{ui.t('account.checking')}</p>

  if (status === 'sent') {
    return (
      <div className="callout">
        <h2>{ui.t('account.reset-done-title')}</h2>
        <p>{ui.t('account.reset-done-body')}</p>
        {/* Root-relative, and correct: this page only exists on the hub. */}
        <Link className="button" href="/account">
          {ui.t('account.reset-open')}
        </Link>
      </div>
    )
  }

  if (!token) {
    return (
      <div className="checker-panel">
        <h2>{ui.t('account.reset-missing-title')}</h2>
        <p className="note">{ui.t('account.reset-missing-body')}</p>
        {/* The way out is on the page rather than a link back to a form
            elsewhere: an expired link and a mangled one both land here, and
            both want the same next step. */}
        <ForgotPasswordForm />
      </div>
    )
  }

  return (
    <form className="checker-panel" onSubmit={onSubmit}>
      <div className="panel-head">
        <h2>{ui.t('account.reset-heading')}</h2>
      </div>
      <p className="note">{ui.t('account.reset-note')}</p>
      <div className="field">
        <label htmlFor="reset-password">{ui.t('account.new-password-label')}</label>
        <input
          id="reset-password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
        <span className="note">{ui.t('account.password-hint')}</span>
      </div>
      <div className="field">
        <label htmlFor="reset-repeat">{ui.t('account.repeat-password-label')}</label>
        <input
          id="reset-repeat"
          name="repeat"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
      </div>
      <div>
        <button type="submit" className="button" disabled={status === 'sending'}>
          {status === 'sending' ? ui.t('form.sending') : ui.t('account.reset-submit')}
        </button>
      </div>
      {status === 'error' ? (
        <p className="note" role="alert" style={{ color: 'var(--risk)' }}>
          {error}
        </p>
      ) : null}
    </form>
  )
}
