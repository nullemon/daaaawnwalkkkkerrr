'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useAccount } from './AccountProvider'
import { ForgotPasswordForm } from './PasswordReset'
import { useRun } from './RunProvider'
import { useUi } from './UiStrings'
import { hub } from '@/lib/urls'
import { fill } from '@/lib/copy'

/**
 * `forgot` is the third mode, and its absence was the whole bug.
 *
 * Payload exposes `POST /api/players/forgot-password` whether or not anything
 * links to it, so the endpoint has always been there while this panel offered
 * sign in and register and no way to reach it. With no template on the
 * collection the message it composed pointed at `/admin/reset/<token>` - the
 * editor admin, which resolves tokens against `users` - so the one reader who
 * found it by hand was told their token was invalid on a page they cannot sign
 * into. The entry point and the page it lands on are the same change; either
 * one alone is still a dead end.
 */
type Mode = 'signin' | 'register' | 'forgot'

/**
 * `checkerHref` is the run checker's address from wherever this panel is.
 *
 * On a wiki that is `/tools/run-checker` and a root-relative link is right.
 * On the hub it is not: the hub is its own origin, and `proxy.ts` reads an
 * unreserved first path segment as a wiki slug - so the button here sent a
 * signed-in reader to `http://tools.<domain>/run-checker`, a 308 to a
 * subdomain that does not exist. Every other hub-to-wiki link on the site
 * already crosses the origin explicitly; this one was written as though the
 * two hosts were one. A caller that has no run checker to point at passes
 * null and the button does not render, which is the honest answer on a
 * network where seven of eight wikis have no such tool.
 */
export function AccountPanel({ checkerHref = '/tools/run-checker' }: { checkerHref?: string | null }) {
  const ui = useUi()
  const account = useAccount()
  const run = useRun()
  const [mode, setMode] = useState<Mode>('signin')
  const [error, setError] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const data = new FormData(event.currentTarget)
    const email = String(data.get('email') ?? '')
    const password = String(data.get('password') ?? '')
    const result =
      mode === 'signin' ? await account.login(email, password) : await account.register(email, password)
    if (!result.ok) setError(result.error ?? ui.t('account.error-generic'))
  }

  if (!account.ready) {
    return <p className="note">{ui.t('account.checking')}</p>
  }

  if (account.player) {
    return (
      <div className="checker-panel">
        <h2>{ui.t('account.signed-in')}</h2>
        <p className="note">
          {fill(ui.t('account.signed-in-note'), { email: account.player.email })}
        </p>
        <dl className="facts">
          <div className="fact">
            <dt>{ui.t('account.position')}</dt>
            <dd>
              Day {run.day} {run.phase}
            </dd>
          </div>
          <div className="fact">
            <dt>{ui.t('account.segments-left')}</dt>
            <dd className="mono">{run.segmentsLeft}</dd>
          </div>
          <div className="fact">
            <dt>{ui.t('account.quests-done')}</dt>
            <dd className="mono">{run.completed.length}</dd>
          </div>
        </dl>
        <p className="note">
          {run.syncing ? ui.t('account.syncing') : ui.t('account.saved')}
        </p>
        <div className="field-row">
          {/* A plain <a> when it crosses an origin: there is no client-side
              navigation to be had between hosts and `Link` would only add a
              prefetch that cannot work. Same rule as `hub()` in urls.ts. */}
          {checkerHref ? (
            checkerHref.startsWith('/') ? (
              <Link className="button" href={checkerHref}>
                {ui.t('account.open-checker')}
              </Link>
            ) : (
              <a className="button" href={checkerHref}>
                {ui.t('account.open-checker')}
              </a>
            )
          ) : null}
          <button type="button" className="linkish" onClick={() => void account.logout()}>
            {ui.t('account.sign-out')}
          </button>
        </div>

        <div className="danger-zone">
          <h3>{ui.t('account.delete-heading')}</h3>
          {confirmingDelete ? (
            <>
              <p className="note">{ui.t('account.delete-warning')}</p>
              <div className="field-row">
                <button
                  type="button"
                  className="button button-danger"
                  disabled={account.busy}
                  onClick={async () => {
                    const result = await account.deleteAccount()
                    if (!result.ok) setError(result.error ?? ui.t('account.error-delete'))
                  }}
                >
                  {account.busy ? ui.t('account.deleting') : ui.t('account.delete-confirm')}
                </button>
                <button type="button" className="linkish" onClick={() => setConfirmingDelete(false)}>
                  {ui.t('form.cancel')}
                </button>
              </div>
            </>
          ) : (
            <button type="button" className="linkish" onClick={() => setConfirmingDelete(true)}>
              {ui.t('account.delete-start')}
            </button>
          )}
          {error ? (
            <p className="note" role="alert" style={{ color: 'var(--risk)' }}>
              {error}
            </p>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div className="checker-panel">
      <div className="panel-head">
        <h2>
          {mode === 'forgot'
            ? ui.t('account.forgot-heading')
            : mode === 'signin'
              ? ui.t('account.sign-in')
              : ui.t('account.register')}
        </h2>
        {/* No toggle while resetting: that form carries its own way back, and
            two controls offering it is two things to keep in step. */}
        {mode === 'forgot' ? null : (
          <button
            type="button"
            className="linkish"
            onClick={() => {
              setMode(mode === 'signin' ? 'register' : 'signin')
              setError('')
            }}
          >
            {mode === 'signin' ? ui.t('account.need-account') : ui.t('account.have-account')}
          </button>
        )}
      </div>

      {mode === 'forgot' ? null : <p className="note">{ui.t('account.optional-note')}</p>}

      {mode === 'forgot' ? (
        <ForgotPasswordForm
          onBack={() => {
            setMode('signin')
            setError('')
          }}
        />
      ) : (
        <form onSubmit={onSubmit} className="stack-sm">
          <div className="field">
            <label htmlFor="account-email">{ui.t('account.email-label')}</label>
            <input id="account-email" name="email" type="email" required autoComplete="email" />
          </div>
          <div className="field">
            <label htmlFor="account-password">{ui.t('account.password-label')}</label>
            <input
              id="account-password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            />
            {mode === 'register' ? (
              <span className="note">{ui.t('account.password-hint')}</span>
            ) : null}
          </div>
          <div className="field-row">
            <button type="submit" className="button" disabled={account.busy}>
              {account.busy
                ? ui.t('account.working')
                : mode === 'signin'
                  ? ui.t('account.sign-in')
                  : ui.t('account.create')}
            </button>
            {/* Only when signing in. On the register form it would read as an
                offer to recover an account that does not exist yet. */}
            {mode === 'signin' ? (
              <button
                type="button"
                className="linkish"
                onClick={() => {
                  setMode('forgot')
                  setError('')
                }}
              >
                {ui.t('account.forgot-start')}
              </button>
            ) : null}
          </div>
          {error ? (
            <p className="note" role="alert" style={{ color: 'var(--risk)' }}>
              {error}
            </p>
          ) : null}
        </form>
      )}

      <p className="note">
        {ui.t('account.privacy-note')}{' '}
        <a href={hub('/privacy')}>{ui.t('account.privacy-link')}</a>.
      </p>
    </div>
  )
}
