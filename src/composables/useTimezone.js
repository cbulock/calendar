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

/**
 * Detect the browser's IANA timezone string.
 * @returns {string}
 */
function detectBrowserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'UTC'
  }
}

/** @type {import('vue').Ref<string>} */
const timezoneRef = ref(localStorage.getItem(STORAGE_KEY) || detectBrowserTimezone())

/**
 * Set the preferred timezone and persist it.
 * @param {string} tz - IANA timezone name (e.g. "America/New_York")
 */
function setTimezone(tz) {
  timezoneRef.value = tz
  localStorage.setItem(STORAGE_KEY, tz)
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
  // Use JS Date to resolve overflow/underflow (e.g., day -4 → prev month, day 32 → next month).
  // This is purely calendar arithmetic — the timezone of the Date object is irrelevant here.
  const resolved = new Date(year, month, day)
  const ry = resolved.getFullYear()
  const rm = String(resolved.getMonth() + 1).padStart(2, '0')
  const rd = String(resolved.getDate()).padStart(2, '0')
  return dayjs.tz(`${ry}-${rm}-${rd} 00:00:00`, tz).toDate()
}

/**
 * Returns today's { year, month (0-based), day } as seen in the given timezone.
 * @param {string} tz - IANA timezone name
 * @returns {{ year: number, month: number, day: number }}
 */
export function getTodayInTimezone(tz) {
  const d = dayjs().tz(tz)
  return { year: d.year(), month: d.month(), day: d.date() }
}

export function useTimezone() {
  return { timezone: timezoneRef, setTimezone }
}
