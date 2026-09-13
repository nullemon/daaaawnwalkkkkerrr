/**
 * The Blood of Dawnwalker measures a run in *segments*, not real time. A day
 * holds 8 daylight segments and 8 night segments, and a run is 30 of them, so
 * the whole game is a budget of 480. The clock only advances on actions the
 * game flags with an hourglass — walking, fast travel, looting and combat are
 * free — which is why this is a budget with prerequisites rather than a timer.
 */

export const SEGMENTS_PER_PHASE = 8
export const SEGMENTS_PER_DAY = SEGMENTS_PER_PHASE * 2 // 16
export const TOTAL_DAYS = 30
export const TOTAL_SEGMENTS = SEGMENTS_PER_DAY * TOTAL_DAYS // 480

export type Phase = 'day' | 'night'
/** Quests may be restricted to one phase, or playable in either. */
export type PhaseRequirement = Phase | 'either'

export interface ClockPosition {
  /** 1-30. */
  day: number
  phase: Phase
  /** 0-7, how far into the current phase. */
  intoPhase: number
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max)

/** Absolute segments elapsed at a given point on the clock. */
export function segmentsSpentAt({ day, phase, intoPhase = 0 }: Partial<ClockPosition> & { day: number; phase: Phase }): number {
  const safeDay = clamp(Math.floor(day), 1, TOTAL_DAYS)
  const safeInto = clamp(Math.floor(intoPhase), 0, SEGMENTS_PER_PHASE - 1)
  return (safeDay - 1) * SEGMENTS_PER_DAY + (phase === 'night' ? SEGMENTS_PER_PHASE : 0) + safeInto
}

/** Inverse of `segmentsSpentAt` — where on the clock a segment count lands. */
export function clockAt(segmentsSpent: number): ClockPosition {
  const safe = clamp(Math.floor(segmentsSpent), 0, TOTAL_SEGMENTS - 1)
  const day = Math.floor(safe / SEGMENTS_PER_DAY) + 1
  const within = safe % SEGMENTS_PER_DAY
  return {
    day,
    phase: within < SEGMENTS_PER_PHASE ? 'day' : 'night',
    intoPhase: within % SEGMENTS_PER_PHASE,
  }
}

export function segmentsRemaining(segmentsSpent: number): number {
  return Math.max(0, TOTAL_SEGMENTS - Math.max(0, segmentsSpent))
}

/** "Day 12, night" — how the game itself would describe a position. */
export function formatClock(position: ClockPosition): string {
  return `Day ${position.day}, ${position.phase}`
}

/**
 * Segments expressed the way a player counts them: whole days plus a
 * remainder, because "14 days and 3 segments" is legible and "227" is not.
 */
export function formatSegments(segments: number): string {
  const safe = Math.max(0, Math.floor(segments))
  const days = Math.floor(safe / SEGMENTS_PER_DAY)
  const rest = safe % SEGMENTS_PER_DAY
  if (days === 0) return `${rest} segment${rest === 1 ? '' : 's'}`
  if (rest === 0) return `${days} day${days === 1 ? '' : 's'}`
  return `${days} day${days === 1 ? '' : 's'}, ${rest} segment${rest === 1 ? '' : 's'}`
}
