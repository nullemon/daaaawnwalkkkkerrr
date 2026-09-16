'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useUi } from './UiStrings'

/**
 * Optional accounts.
 *
 * The site is fully usable signed out — this exists so a run can follow
 * someone from a phone to a desktop, and for nothing else. Everything here
 * fails soft: if the account API is unreachable, the site carries on
 * anonymously rather than blocking.
 *
 * What it says while failing is a reader-facing sentence like any other, so it
 * comes from the interface-text registry rather than being typed into a catch.
 * That is also why `UiStringsProvider` is mounted outside this one in the root
 * layout — a provider cannot read a context below itself.
 */

export interface Player {
  id: string
  email: string
  displayName?: string | null
  run?: unknown
  runUpdatedAt?: string | null
}

interface AccountContextValue {
  player: Player | null
  /** False until the first session check finishes, so nothing flashes signed-out. */
  ready: boolean
  busy: boolean
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>
  register: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => Promise<void>
  saveRun: (run: unknown) => Promise<void>
  deleteAccount: () => Promise<{ ok: boolean; error?: string }>
}

const AccountContext = createContext<AccountContextValue | null>(null)

const readError = async (response: Response, fallback: string): Promise<string> => {
  try {
    const body = await response.json()
    return body?.errors?.[0]?.message || fallback
  } catch {
    return fallback
  }
}

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const ui = useUi()
  const [player, setPlayer] = useState<Player | null>(null)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/players/me', { credentials: 'include' })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (!cancelled && body?.user) setPlayer(body.user as Player)
      })
      .catch(() => {
        // Signed out, or the API is unreachable. Either way: carry on anonymously.
      })
      .finally(() => {
        if (!cancelled) setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    setBusy(true)
    try {
      const response = await fetch('/api/players/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      })
      if (!response.ok) {
        return { ok: false, error: await readError(response, ui.t('account.error-signin')) }
      }
      const body = await response.json()
      setPlayer(body.user as Player)
      return { ok: true }
    } catch {
      return { ok: false, error: ui.t('account.error-network') }
    } finally {
      setBusy(false)
    }
  }, [ui])

  const register = useCallback(
    async (email: string, password: string) => {
      setBusy(true)
      try {
        const response = await fetch('/api/players', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email, password }),
        })
        if (!response.ok) {
          return { ok: false, error: await readError(response, ui.t('account.error-register')) }
        }
        return await login(email, password)
      } catch {
        return { ok: false, error: ui.t('account.error-network') }
      } finally {
        setBusy(false)
      }
    },
    [login, ui],
  )

  const logout = useCallback(async () => {
    try {
      await fetch('/api/players/logout', { method: 'POST', credentials: 'include' })
    } catch {
      // Clearing local state matters more than the round trip succeeding.
    }
    setPlayer(null)
  }, [])

  const saveRun = useCallback(
    async (run: unknown) => {
      if (!player) return
      try {
        await fetch(`/api/players/${player.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ run, runUpdatedAt: new Date().toISOString() }),
        })
      } catch {
        // The browser copy is still authoritative — a failed sync is not worth
        // interrupting someone mid-playthrough.
      }
    },
    [player],
  )

  const deleteAccount = useCallback(async () => {
    if (!player) return { ok: false, error: ui.t('account.error-signed-out') }
    setBusy(true)
    try {
      const response = await fetch(`/api/players/${player.id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!response.ok) {
        return { ok: false, error: await readError(response, ui.t('account.error-delete')) }
      }
      await logout()
      return { ok: true }
    } catch {
      return { ok: false, error: ui.t('account.error-network') }
    } finally {
      setBusy(false)
    }
  }, [player, logout, ui])

  const value = useMemo<AccountContextValue>(
    () => ({ player, ready, busy, login, register, logout, saveRun, deleteAccount }),
    [player, ready, busy, login, register, logout, saveRun, deleteAccount],
  )

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
}

export function useAccount(): AccountContextValue {
  const context = useContext(AccountContext)
  if (!context) throw new Error('useAccount must be used inside AccountProvider')
  return context
}
