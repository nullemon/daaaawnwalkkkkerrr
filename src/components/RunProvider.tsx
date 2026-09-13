'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useAccount } from './AccountProvider'
import {
  SEGMENTS_PER_PHASE,
  TOTAL_DAYS,
  TOTAL_SEGMENTS,
  segmentsSpentAt,
  type Phase,
} from '@/lib/segments'

/**
 * One run, shared by every page.
 *
 * A guide you consult once is a page view. A guide that remembers your run is
 * something you keep open on a second monitor for thirty days. That is the
 * whole retention argument, so run state lives at the layout level rather than
 * inside a single tool.
 *
 * It stays in the browser: no account, no sign-up wall, nothing to lose.
 */

const STORAGE_KEY = 'dw-run-v1'

export interface RunState {
  day: number
  phase: Phase
  intoPhase: number
  completed: string[]
  hideSpoilers: boolean
  started: boolean
  /** When this run last changed, so browser and server copies can be compared. */
  updatedAt: string
}

const DEFAULTS: RunState = {
  day: 1,
  phase: 'day',
  intoPhase: 0,
  completed: [],
  hideSpoilers: true,
  started: false,
  updatedAt: '1970-01-01T00:00:00.000Z',
}

interface RunContextValue extends RunState {
  /** True once the browser value has been read, so nothing renders from defaults first. */
  hydrated: boolean
  /** True while a signed-in run is being reconciled with the server copy. */
  syncing: boolean
  segmentsSpent: number
  segmentsLeft: number
  isDone: (questId: string) => boolean
  toggleQuest: (questId: string) => void
  setClock: (next: { day?: number; phase?: Phase; intoPhase?: number }) => void
  setHideSpoilers: (value: boolean) => void
  reset: () => void
}

const RunContext = createContext<RunContextValue | null>(null)

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

export function RunProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<RunState>(DEFAULTS)
  const [hydrated, setHydrated] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const account = useAccount()
  const reconciled = useRef(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (raw) setState({ ...DEFAULTS, ...(JSON.parse(raw) as Partial<RunState>) })
    } catch {
      // Blocked or corrupt storage just means starting fresh.
    }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // Failing to save is not worth interrupting anyone over.
    }
  }, [hydrated, state])

  /**
   * On sign-in, decide once whether the browser or the server holds the newer
   * run and take that one. Whichever loses is overwritten rather than merged:
   * silently union-ing two quest lists would mark quests done that the player
   * never did, and a wrong "done" is worse than a lost tick.
   */
  useEffect(() => {
    if (!hydrated || !account.ready || reconciled.current) return
    if (!account.player) {
      reconciled.current = true
      return
    }
    setSyncing(true)
    const remote = account.player.run as RunState | undefined
    const remoteAt = account.player.runUpdatedAt ?? remote?.updatedAt
    if (remote && remoteAt && remoteAt > state.updatedAt) {
      setState({ ...DEFAULTS, ...remote })
    } else if (state.started) {
      void account.saveRun(state)
    }
    reconciled.current = true
    setSyncing(false)
  }, [hydrated, account, state])

  // Signing out must not leave the next person on a shared machine holding
  // someone else's run, so allow a fresh reconcile when the session changes.
  useEffect(() => {
    reconciled.current = false
  }, [account.player?.id])

  /** Debounced push, so ticking six quests in a row is one request, not six. */
  useEffect(() => {
    if (!hydrated || !reconciled.current || !account.player || !state.started) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => void account.saveRun(state), 1200)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [hydrated, state, account])

  const toggleQuest = useCallback((questId: string) => {
    setState((current) => ({
      ...current,
      started: true,
      updatedAt: new Date().toISOString(),
      completed: current.completed.includes(questId)
        ? current.completed.filter((entry) => entry !== questId)
        : [...current.completed, questId],
    }))
  }, [])

  const setClock = useCallback((next: { day?: number; phase?: Phase; intoPhase?: number }) => {
    setState((current) => ({
      ...current,
      started: true,
      updatedAt: new Date().toISOString(),
      day: next.day === undefined ? current.day : clamp(Math.floor(next.day), 1, TOTAL_DAYS),
      phase: next.phase ?? current.phase,
      intoPhase:
        next.intoPhase === undefined
          ? current.intoPhase
          : clamp(Math.floor(next.intoPhase), 0, SEGMENTS_PER_PHASE - 1),
    }))
  }, [])

  const setHideSpoilers = useCallback((value: boolean) => {
    setState((current) => ({ ...current, hideSpoilers: value, updatedAt: new Date().toISOString() }))
  }, [])

  const reset = useCallback(
    () => setState({ ...DEFAULTS, updatedAt: new Date().toISOString() }),
    [],
  )

  const value = useMemo<RunContextValue>(() => {
    const segmentsSpent = segmentsSpentAt({
      day: state.day,
      phase: state.phase,
      intoPhase: state.intoPhase,
    })
    return {
      ...state,
      hydrated,
      syncing,
      segmentsSpent,
      segmentsLeft: TOTAL_SEGMENTS - segmentsSpent,
      isDone: (questId: string) => state.completed.includes(questId),
      toggleQuest,
      setClock,
      setHideSpoilers,
      reset,
    }
  }, [state, hydrated, syncing, toggleQuest, setClock, setHideSpoilers, reset])

  return <RunContext.Provider value={value}>{children}</RunContext.Provider>
}

export function useRun(): RunContextValue {
  const context = useContext(RunContext)
  if (!context) throw new Error('useRun must be used inside RunProvider')
  return context
}
