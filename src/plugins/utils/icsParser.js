/**
 * Minimal ICS (iCalendar) parser.
 *
 * Parses VEVENT blocks from an ICS string and returns an array of event objects.
 * Only handles the properties needed for calendar display.
 */

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
 * Parse an ICS date string into a JavaScript Date.
 * Handles DATE-only (YYYYMMDD) and DATETIME (YYYYMMDDTHHmmssZ) formats.
 * @param {string} value - Raw ICS date value
 * @returns {Date}
 */
function parseICSDate(value) {
  if (!value) return null
  // Strip VALUE=DATE: or TZID=... prefixes that may be embedded in the value
  const clean = value.split(':').pop().trim()
  if (clean.length === 8) {
    // DATE only: YYYYMMDD
    const y = clean.slice(0, 4)
    const m = clean.slice(4, 6)
    const d = clean.slice(6, 8)
    return new Date(`${y}-${m}-${d}T00:00:00`)
  }
  // DATETIME: YYYYMMDDTHHmmss[Z]
  const y = clean.slice(0, 4)
  const mo = clean.slice(4, 6)
  const d = clean.slice(6, 8)
  const h = clean.slice(9, 11)
  const min = clean.slice(11, 13)
  const sec = clean.slice(13, 15)
  const utc = clean.endsWith('Z')
  const iso = `${y}-${mo}-${d}T${h}:${min}:${sec}${utc ? 'Z' : ''}`
  return new Date(iso)
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
 * Supports FREQ=DAILY/WEEKLY/MONTHLY/YEARLY with INTERVAL, UNTIL, COUNT, and BYDAY.
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
  const until = p.UNTIL ? parseICSDate(p.UNTIL) : null
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
      // Generate all matching weekdays in the week containing cursor
      const sunday = new Date(cursor)
      sunday.setDate(cursor.getDate() - cursor.getDay())
      candidates = byDay
        .map((dow) => {
          const d = new Date(sunday)
          d.setDate(sunday.getDate() + dow)
          d.setHours(
            event.start.getHours(),
            event.start.getMinutes(),
            event.start.getSeconds(),
            event.start.getMilliseconds(),
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
        const { rrule: _r, exdates: _e, ...rest } = event
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
      default:
        // Unknown frequency — return the original event unchanged
        return [event]
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
      const { rrule: _r, exdates: _e, ...rest } = event
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
      if (current) {
        const allDay = current.dtstart && current.dtstart.length === 8
        const start = parseICSDate(current.dtstart)
        let end = parseICSDate(current.dtend)
        // For all-day events with no DTEND, set end = start
        if (!end) end = start
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
      const propFull = line.slice(0, colonIdx).toLowerCase()
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
          break
        case 'dtend':
          current.dtend = line.slice(colonIdx + 1)
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
          for (const dv of value.split(',')) {
            const d = parseICSDate(dv.trim())
            if (d) current.exdates.push(d)
          }
          break
        }
      }
    }
  }

  return events
}
