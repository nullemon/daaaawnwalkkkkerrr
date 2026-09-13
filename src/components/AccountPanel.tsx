'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useAccount } from './AccountProvider'
import { useRun } from './RunProvider'

type Mode = 'signin' | 'register'

export function AccountPanel() {
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
    if (!result.ok) setError(result.error ?? 'That did not work.')
  }

  if (!account.ready) {
    return <p className="note">Checking…</p>
  }

  if (account.player) {
    return (
      <div className="checker-panel">
        <h2>Signed in</h2>
        <p className="note">
          {account.player.email}. Your run now follows you between devices.
        </p>
        <dl className="facts">
          <div className="fact">
            <dt>Position</dt>
            <dd>
              Day {run.day} {run.phase}
            </dd>
          </div>
          <div className="fact">
            <dt>Segments left</dt>
            <dd className="mono">{run.segmentsLeft}</dd>
          </div>
          <div className="fact">
            <dt>Quests done</dt>
            <dd className="mono">{run.completed.length}</dd>
          </div>
        </dl>
        <p className="note">
          {run.syncing ? 'Syncing…' : 'Saved. Changes sync automatically.'}
        </p>
        <div className="field-row">
          <Link className="button" href="/tools/run-checker">
            Open the run checker
          </Link>
          <button type="button" className="linkish" onClick={() => void account.logout()}>
            Sign out
          </button>
        </div>

        <div className="danger-zone">
          <h3>Delete this account</h3>
          {confirmingDelete ? (
            <>
              <p className="note">
                This removes your email and your saved run from the server for good. Your run stays
                in this browser — signing out does not wipe it.
              </p>
              <div className="field-row">
                <button
                  type="button"
                  className="button button-danger"
                  disabled={account.busy}
                  onClick={async () => {
                    const result = await account.deleteAccount()
                    if (!result.ok) setError(result.error ?? 'Could not delete the account.')
                  }}
                >
                  {account.busy ? 'Deleting…' : 'Yes, delete it permanently'}
                </button>
                <button type="button" className="linkish" onClick={() => setConfirmingDelete(false)}>
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <button type="button" className="linkish" onClick={() => setConfirmingDelete(true)}>
              Delete account and saved run
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
        <h2>{mode === 'signin' ? 'Sign in' : 'Create an account'}</h2>
        <button
          type="button"
          className="linkish"
          onClick={() => {
            setMode(mode === 'signin' ? 'register' : 'signin')
            setError('')
          }}
        >
          {mode === 'signin' ? 'Need an account?' : 'Already have one?'}
        </button>
      </div>

      <p className="note">
        You do not need this. Everything on the site works signed out, with your run kept in this
        browser. An account exists only so the same run opens on your phone and your desktop.
      </p>

      <form onSubmit={onSubmit} className="stack-sm">
        <div className="field">
          <label htmlFor="account-email">Email</label>
          <input id="account-email" name="email" type="email" required autoComplete="email" />
        </div>
        <div className="field">
          <label htmlFor="account-password">Password</label>
          <input
            id="account-password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          />
          {mode === 'register' ? <span className="note">At least 8 characters.</span> : null}
        </div>
        <div>
          <button type="submit" className="button" disabled={account.busy}>
            {account.busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </div>
        {error ? (
          <p className="note" role="alert" style={{ color: 'var(--risk)' }}>
            {error}
          </p>
        ) : null}
      </form>

      <p className="note">
        We store your email and your run. Nothing else. See the{' '}
        <Link href="/privacy">privacy policy</Link>.
      </p>
    </div>
  )
}
