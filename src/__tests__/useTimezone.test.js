import { describe, it, expect } from 'vitest'
import { midnightInTimezone, getTodayInTimezone } from '../composables/useTimezone.js'

describe('midnightInTimezone', () => {
  it('returns midnight UTC for a given date in a negative-offset timezone (New York winter, UTC-5)', () => {
    // Midnight on 2025-01-15 in New York (EST = UTC-5) → 05:00 UTC
    const result = midnightInTimezone(2025, 0, 15, 'America/New_York')
    expect(result).toBeInstanceOf(Date)
    expect(result.toISOString()).toBe('2025-01-15T05:00:00.000Z')
  })

  it('returns midnight UTC for a given date in a positive-offset timezone (Tokyo, UTC+9)', () => {
    // Midnight on 2025-03-15 in Tokyo (JST = UTC+9) → 2025-03-14T15:00:00Z
    const result = midnightInTimezone(2025, 2, 15, 'Asia/Tokyo')
    expect(result).toBeInstanceOf(Date)
    expect(result.toISOString()).toBe('2025-03-14T15:00:00.000Z')
  })

  it('returns midnight UTC in UTC timezone', () => {
    const result = midnightInTimezone(2025, 2, 15, 'UTC')
    expect(result.toISOString()).toBe('2025-03-15T00:00:00.000Z')
  })

  it('handles DST — New York summer midnight (UTC-4)', () => {
    // Midnight on 2025-07-15 in New York (EDT = UTC-4) → 04:00 UTC
    const result = midnightInTimezone(2025, 6, 15, 'America/New_York')
    expect(result.toISOString()).toBe('2025-07-15T04:00:00.000Z')
  })
})

describe('getTodayInTimezone', () => {
  it('returns year/month/day as integers', () => {
    const result = getTodayInTimezone('UTC')
    expect(typeof result.year).toBe('number')
    expect(typeof result.month).toBe('number')
    expect(typeof result.day).toBe('number')
    // month is 0-based
    expect(result.month).toBeGreaterThanOrEqual(0)
    expect(result.month).toBeLessThanOrEqual(11)
    expect(result.day).toBeGreaterThanOrEqual(1)
    expect(result.day).toBeLessThanOrEqual(31)
  })

  it('returns consistent values with new Date() in UTC', () => {
    const now = new Date()
    const result = getTodayInTimezone('UTC')
    expect(result.year).toBe(now.getUTCFullYear())
    expect(result.month).toBe(now.getUTCMonth())
    expect(result.day).toBe(now.getUTCDate())
  })
})
