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
 * Returns true if the given IANA timezone identifier is recognised by day.js
 * (i.e., would NOT fall through to floating-time treatment in parseICSDate).
 * @param {string} tzid
 * @returns {boolean}
 */
function isSupportedTZID(tzid) {
  if (!tzid) return false
  try {
    // dayjs.tz() throws if the timezone is unknown; use a fixed reference
    // datetime that won't hit DST edge cases.
    dayjs.tz('20000101T000000', 'YYYYMMDDTHHmmss', tzid)
    return true
  } catch {
    return false
  }
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
  // Floating time (no timezone specified) — preserve the wall-clock time by
  // storing it as a UTC instant with identical hour/minute values.  Using
  // dayjs.utc() here (rather than the bare dayjs() constructor) avoids any
  // influence from the server's local timezone so the result is the same
  // regardless of where the server process is running.
  return dayjs.utc(clean, 'YYYYMMDDTHHmmss').toDate()
}

/**
 * Unfold ICS content lines (lines continued with a leading space/tab).
 * @param {string} text - Raw ICS text
 * @returns {string[]} Array of logical lines
 */
function unfoldLines(text) {
  // Handle both CRLF (RFC 5545 standard) and LF-only line endings
  return text
    .replace(/\r\n[ \t]/g, '')
    .replace(/\n[ \t]/g, '')
    .replace(/\r\n/g, '\n')
    .split('\n')
}

/** Maps RFC 5545 2-letter weekday codes to JavaScript getDay() values (0=Sunday). */
const RRULE_WEEKDAY = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }

/**
 * Parse an RRULE value string into a key/value parameter map.
 * @param {string} rrule - e.g. "FREQ=WEEKLY;BYDAY=MO,WE;INTERVAL=2"
 * @returns {Object}
 */
function parseRRuleParams(rrule) {
  const params = {}
  for (const part of rrule.split(';')) {
    const eq = part.indexOf('=')
    if (eq !== -1) {
      params[part.slice(0, eq)] = part.slice(eq + 1)
    }
  }
  return params
}

/**
 * Expand a single recurring event into all occurrences that overlap [rangeStart, rangeEnd].
 * Supports FREQ=DAILY/WEEKLY/MONTHLY/YEARLY with INTERVAL, UNTIL, and COUNT.
 * For FREQ=WEEKLY, BYDAY is also supported.
 *
 * @param {object} event      - Base event object (must have start, end, rrule, exdates)
 * @param {Date}   rangeStart - Inclusive start of the requested window
 * @param {Date}   rangeEnd   - Inclusive end of the requested window
 * @returns {object[]} Occurrence event objects (without rrule/exdates properties)
 */
function expandRRule(event, rangeStart, rangeEnd) {
  const p = parseRRuleParams(event.rrule)
  if (!p.FREQ) return [event]

  const interval = Math.max(1, parseInt(p.INTERVAL ?? '1', 10))
  // Note: parseICSDate checks for a 'Z' suffix first, so UTC UNTIL values are
  // always parsed as UTC regardless of startTzid. startTzid is only applied
  // to floating-time (non-Z) UNTIL values per RFC 5545 § 3.3.10.
  const until = p.UNTIL ? parseICSDate(p.UNTIL, event.startTzid) : null
  const maxCount = p.COUNT ? parseInt(p.COUNT, 10) : null

  // Strip positional prefix (e.g. "1MO", "-1FR" → "MO", "FR") then map to JS day index.
  // Filter out any codes that do not map to a known weekday.
  const byDay = p.BYDAY
    ? p.BYDAY
        .split(',')
        .map((d) => RRULE_WEEKDAY[d.replace(/^[+-]?\d+/, '').trim()])
        .filter((d) => d !== undefined)
    : null

  const duration = event.end.getTime() - event.start.getTime()

  // Build a set of excluded occurrence start times (epoch ms) for fast lookup
  const exdateSet = new Set((event.exdates ?? []).map((d) => d.getTime()))

  const results = []
  let cursor = new Date(event.start)
  let count = 0

  // Fast-forward cursor for simple (non-BYDAY) daily/weekly rules to avoid
  // iterating through years of history one step at a time.
  if (p.FREQ === 'DAILY' || (p.FREQ === 'WEEKLY' && !byDay)) {
    const periodMs = (p.FREQ === 'DAILY' ? 1 : 7) * interval * 24 * 60 * 60 * 1000
    const targetMs = rangeStart.getTime() - duration
    if (cursor.getTime() < targetMs && periodMs > 0) {
      const stepsToSkip = Math.floor((targetMs - cursor.getTime()) / periodMs)
      const skippable = maxCount !== null ? Math.min(stepsToSkip, maxCount - count) : stepsToSkip
      cursor = new Date(cursor.getTime() + skippable * periodMs)
      count += skippable
    }
  }

  const SAFETY_CAP = 10000
  for (let iter = 0; iter < SAFETY_CAP; iter++) {
    if (until && cursor > until) break
    if (maxCount !== null && count >= maxCount) break
    if (cursor > rangeEnd) break

    // Collect candidate occurrence start times for this iteration
    let candidates
    if (p.FREQ === 'WEEKLY' && byDay && byDay.length > 0) {
      // Generate all matching weekdays in the week containing cursor.
      // Use UTC APIs throughout so expansion is timezone-agnostic and
      // produces consistent results regardless of the runtime's local TZ.
      const sunday = new Date(cursor)
      sunday.setUTCDate(cursor.getUTCDate() - cursor.getUTCDay())
      candidates = byDay
        .map((dow) => {
          const d = new Date(sunday)
          d.setUTCDate(sunday.getUTCDate() + dow)
          d.setUTCHours(
            event.start.getUTCHours(),
            event.start.getUTCMinutes(),
            event.start.getUTCSeconds(),
            event.start.getUTCMilliseconds(),
          )
          return d
        })
        .filter((d) => d >= event.start) // never before the series start
        .sort((a, b) => a - b)
    } else {
      candidates = [new Date(cursor)]
    }

    for (const occ of candidates) {
      if (until && occ > until) break
      if (maxCount !== null && count >= maxCount) break
      count++

      if (exdateSet.has(occ.getTime())) continue

      const occEnd = new Date(occ.getTime() + duration)
      if (occEnd >= rangeStart && occ <= rangeEnd) {
        // eslint-disable-next-line no-unused-vars
        const { rrule: _r, exdates: _e, startTzid: _t, ...rest } = event
        results.push({ ...rest, start: occ, end: occEnd, id: `${event.id}__occ__${occ.getTime()}` })
      }
    }

    // Advance cursor by one recurrence period
    switch (p.FREQ) {
      case 'DAILY':
        cursor = new Date(cursor)
        cursor.setDate(cursor.getDate() + interval)
        break
      case 'WEEKLY':
        cursor = new Date(cursor)
        cursor.setDate(cursor.getDate() + 7 * interval)
        break
      case 'MONTHLY':
        cursor = new Date(cursor)
        cursor.setMonth(cursor.getMonth() + interval)
        break
      case 'YEARLY':
        cursor = new Date(cursor)
        cursor.setFullYear(cursor.getFullYear() + interval)
        break
      default: {
        // Unknown frequency — cannot reliably expand; return a single
        // base event without recurrence-only fields to keep shape consistent.
        // eslint-disable-next-line no-unused-vars
        const { rrule: _r, exdates: _e, startTzid: _t, ...rest } = event
        return [{ ...rest }]
      }
    }
  }

  return results
}

/**
 * Expand any recurring events in the list into individual occurrences within
 * [rangeStart, rangeEnd]. Non-recurring events are passed through as-is.
 *
 * @param {object[]} events    - Raw events from parseICSData
 * @param {Date}     rangeStart
 * @param {Date}     rangeEnd
 * @returns {object[]}
 */
export function expandEvents(events, rangeStart, rangeEnd) {
  const results = []
  for (const event of events) {
    if (event.rrule) {
      results.push(...expandRRule(event, rangeStart, rangeEnd))
    } else {
      // eslint-disable-next-line no-unused-vars
      const { rrule: _r, exdates: _e, startTzid: _t, ...rest } = event
      results.push(rest)
    }
  }
  return results
}

/**
 * Parse ICS text into an array of calendar event objects.
 * @param {string} icsText - Raw ICS/iCalendar text
 * @param {string} sourceId - Plugin ID to tag each event with
 * @returns {Array<{id, title, start, end, allDay, description, location, status, source, rrule?, exdates?}>}
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
        // A floating time has no TZID parameter and no explicit UTC 'Z' suffix.
        // It also includes events whose TZID is unsupported/unknown (those fall
        // through to the same UTC wall-clock storage path in parseICSDate).
        // All-day events (DATE-only) are excluded — they are inherently date-only
        // and do not have a wall-clock time component.
        const floating =
          !allDay &&
          Boolean(current.dtstart) &&
          !current.dtstart.endsWith('Z') &&
          !isSupportedTZID(current.dtstart_tzid)
        const event = {
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
        }
        if (floating) event.floating = true
        if (current.dtstart_tzid) event.startTzid = current.dtstart_tzid
        if (current.rrule) event.rrule = current.rrule
        if (current.exdates && current.exdates.length > 0) event.exdates = current.exdates
        events.push(event)
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
        case 'rrule':
          current.rrule = value
          break
        case 'exdate': {
          // EXDATE may contain multiple comma-separated datetime values
          if (!current.exdates) current.exdates = []
          const exdateTZID = extractTZID(rawPropSegment)
          for (const dv of value.split(',')) {
            const d = parseICSDate(dv.trim(), exdateTZID)
            if (d) current.exdates.push(d)
          }
          break
        }
      }
    }
  }

  return events
}
