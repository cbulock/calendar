/**
 * Minimal ICS (iCalendar) parser.
 *
 * Parses VEVENT blocks from an ICS string and returns an array of event objects.
 * Only handles the properties needed for calendar display.
 */

import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import customParseFormat from 'dayjs/plugin/customParseFormat.js'
import timezone from 'dayjs/plugin/timezone.js'

dayjs.extend(utc)
dayjs.extend(customParseFormat)
dayjs.extend(timezone)

/**
 * Compute a simple deterministic hash string from the given input string.
 * Uses a djb2-style algorithm and returns a hex string.
 * @param {string} str
 * @returns {string}
 */
function hashString(str) {
  let h = 5381
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i)
    h = h >>> 0 // keep as unsigned 32-bit
  }
  return h.toString(16)
}

/**
 * Extract the TZID parameter value from an ICS property line's parameter segment.
 * Preserves the original casing of the TZID value (IANA timezone names are case-sensitive).
 * Also strips optional surrounding quotes from the value.
 * e.g. the original line segment "DTSTART;TZID=America/New_York" → "America/New_York"
 * @param {string} rawParamSegment - The raw (un-lowercased) text before the colon, e.g. "DTSTART;TZID=America/New_York"
 * @returns {string|null}
 */
function extractTZID(rawParamSegment) {
  for (const param of rawParamSegment.split(';').slice(1)) {
    if (param.toLowerCase().startsWith('tzid=')) {
      return param.slice(5).replace(/^"|"$/g, '')
    }
  }
  return null
}

/**
 * Parse an ICS date string into a JavaScript Date.
 * Handles DATE-only (YYYYMMDD) and DATETIME (YYYYMMDDTHHmmssZ) formats.
 * When a TZID is provided, the local datetime is properly converted to UTC
 * using day.js timezone support.
 * @param {string} value - Raw ICS date value (after the colon)
 * @param {string|null} tzid - IANA timezone extracted from property parameters
 * @returns {Date}
 */
function parseICSDate(value, tzid) {
  if (!value) return null
  // Strip VALUE=DATE: or TZID=... prefixes that may be embedded in the value
  const clean = value.split(':').pop().trim()
  if (clean.length === 8) {
    // DATE only: YYYYMMDD — all-day, not timezone-sensitive for boundaries
    return dayjs(clean, 'YYYYMMDD').toDate()
  }
  // DATETIME: YYYYMMDDTHHmmss[Z]
  if (clean.endsWith('Z')) {
    // Explicit UTC — parse directly as UTC
    return dayjs.utc(clean, 'YYYYMMDDTHHmmss[Z]').toDate()
  }
  if (tzid) {
    // Local time in a named timezone — day.js converts to UTC internally
    try {
      return dayjs.tz(clean, 'YYYYMMDDTHHmmss', tzid).toDate()
    } catch {
      // Unknown/unsupported TZID — fall through to floating-time treatment
    }
  }
  // Floating time (no timezone specified) — treat as local/server time
  return dayjs(clean, 'YYYYMMDDTHHmmss').toDate()
}

/**
 * Unfold ICS content lines (lines continued with a leading space/tab).
 * @param {string} text - Raw ICS text
 * @returns {string[]} Array of logical lines
 */
function unfoldLines(text) {
  return text.replace(/\r\n[ \t]/g, '').replace(/\r\n/g, '\n').split('\n')
}

/**
 * Parse ICS text into an array of calendar event objects.
 * @param {string} icsText - Raw ICS/iCalendar text
 * @param {string} sourceId - Plugin ID to tag each event with
 * @returns {Array<{id, title, start, end, allDay, description, location, status, source}>}
 */
export function parseICSData(icsText, sourceId) {
  const lines = unfoldLines(icsText)
  const events = []
  let current = null

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      current = {}
      continue
    }
    if (line === 'END:VEVENT') {
      // RFC 5545 defines three VEVENT statuses: TENTATIVE, CONFIRMED, CANCELLED.
      // TENTATIVE and CONFIRMED events represent real calendar time and should be
      // displayed. Only CANCELLED events are hidden.
      if (current && current.status !== 'CANCELLED') {
        const allDay = current.dtstart && current.dtstart.length === 8
        const start = parseICSDate(current.dtstart, current.dtstart_tzid)
        let end = parseICSDate(current.dtend, current.dtend_tzid)
        // For all-day events with no DTEND, set end = start
        if (!end) end = start
        events.push({
          id:
            current.uid ||
            `${sourceId}-${hashString(
              [sourceId, current.dtstart, current.dtend, current.summary, current.location].join('|'),
            )}`,
          title: current.summary || '(No title)',
          start,
          end,
          allDay: Boolean(allDay),
          description: current.description || '',
          location: current.location || '',
          status: current.status || '',
          source: sourceId,
        })
      }
      current = null
      continue
    }

    if (current !== null) {
      // Parse property name (may include parameters like DTSTART;TZID=...)
      const colonIdx = line.indexOf(':')
      if (colonIdx === -1) continue
      const rawPropSegment = line.slice(0, colonIdx)
      const propFull = rawPropSegment.toLowerCase()
      const value = line.slice(colonIdx + 1)
      // Strip parameters (e.g. DTSTART;TZID=America/New_York -> dtstart)
      const prop = propFull.split(';')[0]

      switch (prop) {
        case 'uid':
          current.uid = value
          break
        case 'summary':
          current.summary = value
          break
        case 'dtstart':
          // Keep full line value so we can detect DATE-only
          current.dtstart = line.slice(colonIdx + 1)
          current.dtstart_tzid = extractTZID(rawPropSegment)
          break
        case 'dtend':
          current.dtend = line.slice(colonIdx + 1)
          current.dtend_tzid = extractTZID(rawPropSegment)
          break
        case 'description':
          current.description = value.replace(/\\n/g, '\n').replace(/\\,/g, ',')
          break
        case 'location':
          current.location = value
          break
        case 'status':
          current.status = value.toUpperCase()
          break
      }
    }
  }

  return events
}
