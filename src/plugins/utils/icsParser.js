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
        const start = parseICSDate(current.dtstart)
        let end = parseICSDate(current.dtend)
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
      }
    }
  }

  return events
}
