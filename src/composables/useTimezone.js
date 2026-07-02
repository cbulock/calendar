/**
 * useTimezone composable
 *
 * Manages the user's preferred display timezone.
 * Defaults to the browser's detected timezone.
 * Persists the selection to localStorage.
 *
 * Uses day.js (with the utc + timezone plugins) for all timezone maths.
 */

import { ref } from 'vue'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import timezone from 'dayjs/plugin/timezone.js'

dayjs.extend(utc)
dayjs.extend(timezone)

const STORAGE_KEY = 'calendar_timezone'

export function isValidTimezone(tz) {
  if (typeof tz !== 'string') return false
  const candidate = tz.trim()
  if (!candidate) return false
  try {
    dayjs.tz('2025-01-15T12:00:00', candidate)
    return true
  } catch {
    return false
  }
}

function normalizeTimezone(tz, fallback = 'UTC') {
  return isValidTimezone(tz) ? tz.trim() : fallback
}

function detectHashQueryTimezone() {
  if (typeof window === 'undefined') return null

  const hash = window.location.hash || ''
  const queryIndex = hash.indexOf('?')
  if (queryIndex === -1) return null

  const params = new URLSearchParams(hash.slice(queryIndex + 1))
  const timezone = params.get('timezone')
  return timezone || null
}

/**
 * Detect the browser's IANA timezone string.
 * @returns {string}
 */
function detectBrowserTimezone() {
  try {
    return normalizeTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone)
  } catch {
    return 'UTC'
  }
}

function resolveInitialTimezone() {
  const candidates = [
    detectHashQueryTimezone(),
    typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null,
    detectBrowserTimezone(),
    'UTC',
  ]

  for (const candidate of candidates) {
    if (isValidTimezone(candidate)) {
      return candidate.trim()
    }
  }

  return 'UTC'
}

/** @type {import('vue').Ref<string>} */
const timezoneRef = ref(resolveInitialTimezone())

/**
 * Set the preferred timezone and persist it.
 * @param {string} tz - IANA timezone name (e.g. "America/New_York")
 */
function setTimezone(tz) {
  const nextTimezone = normalizeTimezone(tz, detectBrowserTimezone())
  timezoneRef.value = nextTimezone
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, nextTimezone)
  }
}

/**
 * Returns a Date representing midnight (00:00:00) on the given calendar date
 * in the specified IANA timezone.
 *
 * @param {number} year
 * @param {number} month - 0-based (0 = January)
 * @param {number} day  - 1-based
 * @param {string} tz   - IANA timezone name
 * @returns {Date}
 */
export function midnightInTimezone(year, month, day, tz) {
  // Date.UTC() resolves overflow/underflow in calendar arithmetic (e.g. month 13 or day 0)
  // so that host-local timezone/DST transitions do not affect the resolved calendar date.
  // dayjs.utc() wraps the resulting numeric timestamp for chainable accessor methods.
  const resolved = dayjs.utc(Date.UTC(year, month, day))
  const ry = resolved.year()
  const rm = String(resolved.month() + 1).padStart(2, '0')
  const rd = String(resolved.date()).padStart(2, '0')
  try {
    return dayjs.tz(`${ry}-${rm}-${rd}T00:00:00`, tz).toDate()
  } catch {
    // Invalid/unsupported timezone — fall back to UTC midnight
    return resolved.toDate()
  }
}

/**
 * Returns today's { year, month (0-based), day } as seen in the given timezone.
 * @param {string} tz - IANA timezone name
 * @returns {{ year: number, month: number, day: number }}
 */
export function getTodayInTimezone(tz) {
  const d = dayjs().tz(normalizeTimezone(tz))
  return { year: d.year(), month: d.month(), day: d.date() }
}

export function useTimezone() {
  return { timezone: timezoneRef, setTimezone }
}
