import { describe, expect, it } from 'vitest'
import {
  SEGMENTS_PER_DAY,
  TOTAL_SEGMENTS,
  clockAt,
  formatSegments,
  segmentsRemaining,
  segmentsSpentAt,
} from './segments'

describe('the clock', () => {
  it('is 480 segments across 30 days', () => {
    expect(SEGMENTS_PER_DAY).toBe(16)
    expect(TOTAL_SEGMENTS).toBe(480)
  })

  it('starts the run at segment zero', () => {
    expect(segmentsSpentAt({ day: 1, phase: 'day' })).toBe(0)
  })

  it('puts nightfall halfway through the day', () => {
    expect(segmentsSpentAt({ day: 1, phase: 'night' })).toBe(8)
  })

  it('round-trips between a clock position and a segment count', () => {
    for (const day of [1, 7, 15, 30]) {
      for (const phase of ['day', 'night'] as const) {
        const spent = segmentsSpentAt({ day, phase, intoPhase: 3 })
        expect(clockAt(spent)).toEqual({ day, phase, intoPhase: 3 })
      }
    }
  })

  it('clamps out-of-range input instead of returning nonsense', () => {
    expect(segmentsSpentAt({ day: 99, phase: 'day' })).toBe(segmentsSpentAt({ day: 30, phase: 'day' }))
    expect(segmentsSpentAt({ day: 0, phase: 'day' })).toBe(0)
    expect(segmentsRemaining(9999)).toBe(0)
    expect(segmentsRemaining(-5)).toBe(TOTAL_SEGMENTS)
  })

  it('describes a budget the way a player counts it', () => {
    expect(formatSegments(0)).toBe('0 segments')
    expect(formatSegments(1)).toBe('1 segment')
    expect(formatSegments(16)).toBe('1 day')
    expect(formatSegments(35)).toBe('2 days, 3 segments')
  })
})
