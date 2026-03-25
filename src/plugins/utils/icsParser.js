/**
 * ICS (iCalendar) parser backed by ical.js.
 *
 * Uses ical.js (Mozilla's RFC 5545 implementation) for robust structural
 * parsing of VEVENT blocks, then converts timestamps to JavaScript Date objects
 * using dayjs (with the timezone plugin) so that Outlook/Exchange Windows
 * timezone names, floating-time events, and all-day events are all handled
 * correctly.
 *
 * ## DateTime convention
 * ALL date/time arithmetic in this file MUST use dayjs (or dayjs.tz() for
 * timezone-aware work).  Never use raw JavaScript Date arithmetic (setDate,
 * setHours, fixed-ms offsets, etc.) for anything timezone-sensitive, because
 * plain Date operations are unaware of DST transitions and will produce
 * incorrect results when a recurring event's occurrences span a DST boundary.
 *
 * Correct pattern:
 *   dayjs.tz('2026-03-12T12:30:00', 'America/Denver').toDate()  // DST-aware
 *
 * Incorrect pattern:
 *   new Date(someDate.getTime() + 7 * 24 * 60 * 60 * 1000)     // DST-blind
 */

import ICAL from 'ical.js'
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
 * Mapping from Windows timezone names (used by Outlook/Exchange) to IANA timezone identifiers.
 * Source: CLDR windowsZones (https://cldr.unicode.org/translation/timezones)
 * Outlook ICS files use Windows timezone names in TZID parameters rather than IANA names,
 * which causes dayjs.tz() to fail and fall back to floating-time treatment.
 */
const WINDOWS_TO_IANA = {
  'AUS Central Standard Time': 'Australia/Darwin',
  'AUS Eastern Standard Time': 'Australia/Sydney',
  'Afghanistan Standard Time': 'Asia/Kabul',
  'Alaskan Standard Time': 'America/Anchorage',
  'Aleutian Standard Time': 'America/Adak',
  'Altai Standard Time': 'Asia/Barnaul',
  'Arab Standard Time': 'Asia/Riyadh',
  'Arabian Standard Time': 'Asia/Dubai',
  'Arabic Standard Time': 'Asia/Baghdad',
  'Argentina Standard Time': 'America/Buenos_Aires',
  'Astrakhan Standard Time': 'Europe/Astrakhan',
  'Atlantic Standard Time': 'America/Halifax',
  'Aus Central W. Standard Time': 'Australia/Eucla',
  'Azerbaijan Standard Time': 'Asia/Baku',
  'Azores Standard Time': 'Atlantic/Azores',
  'Bahia Standard Time': 'America/Bahia',
  'Bangladesh Standard Time': 'Asia/Dhaka',
  'Canada Central Standard Time': 'America/Regina',
  'Cape Verde Standard Time': 'Atlantic/Cape_Verde',
  'Caucasus Standard Time': 'Asia/Yerevan',
  'Cen. Australia Standard Time': 'Australia/Adelaide',
  'Central America Standard Time': 'America/Guatemala',
  'Central Asia Standard Time': 'Asia/Almaty',
  'Central Brazilian Standard Time': 'America/Cuiaba',
  'Central Europe Standard Time': 'Europe/Budapest',
  'Central European Standard Time': 'Europe/Warsaw',
  'Central Pacific Standard Time': 'Pacific/Guadalcanal',
  'Central Standard Time': 'America/Chicago',
  'Central Standard Time (Mexico)': 'America/Mexico_City',
  'Chatham Islands Standard Time': 'Pacific/Chatham',
  'China Standard Time': 'Asia/Shanghai',
  'Cuba Standard Time': 'America/Havana',
  'Dateline Standard Time': 'Etc/GMT+12',
  'E. Africa Standard Time': 'Africa/Nairobi',
  'E. Australia Standard Time': 'Australia/Brisbane',
  'E. Europe Standard Time': 'Asia/Nicosia',
  'E. South America Standard Time': 'America/Sao_Paulo',
  'Easter Island Standard Time': 'Pacific/Easter',
  'Eastern Standard Time': 'America/New_York',
  'Eastern Standard Time (Mexico)': 'America/Cancun',
  'Egypt Standard Time': 'Africa/Cairo',
  'Ekaterinburg Standard Time': 'Asia/Yekaterinburg',
  'FLE Standard Time': 'Europe/Kyiv',
  'Fiji Standard Time': 'Pacific/Fiji',
  'GMT Standard Time': 'Europe/London',
  'GTB Standard Time': 'Europe/Bucharest',
  'Georgian Standard Time': 'Asia/Tbilisi',
  'Greenland Standard Time': 'America/Nuuk',
  'Greenwich Standard Time': 'Atlantic/Reykjavik',
  'Haiti Standard Time': 'America/Port-au-Prince',
  'Hawaiian Standard Time': 'Pacific/Honolulu',
  'India Standard Time': 'Asia/Kolkata',
  'Iran Standard Time': 'Asia/Tehran',
  'Israel Standard Time': 'Asia/Jerusalem',
  'Jordan Standard Time': 'Asia/Amman',
  'Kaliningrad Standard Time': 'Europe/Kaliningrad',
  'Korea Standard Time': 'Asia/Seoul',
  'Libya Standard Time': 'Africa/Tripoli',
  'Line Islands Standard Time': 'Pacific/Kiritimati',
  'Lord Howe Standard Time': 'Australia/Lord_Howe',
  'Magadan Standard Time': 'Asia/Magadan',
  'Magallanes Standard Time': 'America/Punta_Arenas',
  'Marquesas Standard Time': 'Pacific/Marquesas',
  'Mauritius Standard Time': 'Indian/Mauritius',
  'Middle East Standard Time': 'Asia/Beirut',
  'Montevideo Standard Time': 'America/Montevideo',
  'Morocco Standard Time': 'Africa/Casablanca',
  'Mountain Standard Time': 'America/Denver',
  'Mountain Standard Time (Mexico)': 'America/Chihuahua',
  'Myanmar Standard Time': 'Asia/Yangon',
  'N. Central Asia Standard Time': 'Asia/Novosibirsk',
  'Namibia Standard Time': 'Africa/Windhoek',
  'Nepal Standard Time': 'Asia/Kathmandu',
  'New Zealand Standard Time': 'Pacific/Auckland',
  'Newfoundland Standard Time': 'America/St_Johns',
  'Norfolk Standard Time': 'Pacific/Norfolk',
  'North Asia East Standard Time': 'Asia/Irkutsk',
  'North Asia Standard Time': 'Asia/Krasnoyarsk',
  'North Korea Standard Time': 'Asia/Pyongyang',
  'Omsk Standard Time': 'Asia/Omsk',
  'Pacific SA Standard Time': 'America/Santiago',
  'Pacific Standard Time': 'America/Los_Angeles',
  'Pacific Standard Time (Mexico)': 'America/Tijuana',
  'Pakistan Standard Time': 'Asia/Karachi',
  'Paraguay Standard Time': 'America/Asuncion',
  'Qyzylorda Standard Time': 'Asia/Qyzylorda',
  'Romance Standard Time': 'Europe/Paris',
  'Russia Time Zone 10': 'Asia/Srednekolymsk',
  'Russia Time Zone 11': 'Asia/Kamchatka',
  'Russia Time Zone 3': 'Europe/Samara',
  'Russian Standard Time': 'Europe/Moscow',
  'SA Eastern Standard Time': 'America/Cayenne',
  'SA Pacific Standard Time': 'America/Bogota',
  'SA Western Standard Time': 'America/La_Paz',
  'SE Asia Standard Time': 'Asia/Bangkok',
  'Saint Pierre Standard Time': 'America/Miquelon',
  'Sakhalin Standard Time': 'Asia/Sakhalin',
  'Samoa Standard Time': 'Pacific/Apia',
  'Sao Tome Standard Time': 'Africa/Sao_Tome',
  'Saratov Standard Time': 'Europe/Saratov',
  'Singapore Standard Time': 'Asia/Singapore',
  'South Africa Standard Time': 'Africa/Johannesburg',
  'South Sudan Standard Time': 'Africa/Juba',
  'Sri Lanka Standard Time': 'Asia/Colombo',
  'Sudan Standard Time': 'Africa/Khartoum',
  'Syria Standard Time': 'Asia/Damascus',
  'Taipei Standard Time': 'Asia/Taipei',
  'Tasmania Standard Time': 'Australia/Hobart',
  'Tocantins Standard Time': 'America/Araguaina',
  'Tokyo Standard Time': 'Asia/Tokyo',
  'Tomsk Standard Time': 'Asia/Tomsk',
  'Tonga Standard Time': 'Pacific/Tongatapu',
  'Transbaikal Standard Time': 'Asia/Chita',
  'Turkey Standard Time': 'Europe/Istanbul',
  'Turks And Caicos Standard Time': 'America/Grand_Turk',
  'US Eastern Standard Time': 'America/Indianapolis',
  'US Mountain Standard Time': 'America/Phoenix',
  'UTC': 'UTC',
  'UTC+12': 'Etc/GMT-12',
  'UTC+13': 'Etc/GMT-13',
  'UTC-02': 'Etc/GMT+2',
  'UTC-08': 'Etc/GMT+8',
  'UTC-09': 'Etc/GMT+9',
  'UTC-11': 'Etc/GMT+11',
  'Ulaanbaatar Standard Time': 'Asia/Ulaanbaatar',
  'Venezuela Standard Time': 'America/Caracas',
  'Vladivostok Standard Time': 'Asia/Vladivostok',
  'Volgograd Standard Time': 'Europe/Volgograd',
  'W. Australia Standard Time': 'Australia/Perth',
  'W. Central Africa Standard Time': 'Africa/Lagos',
  'W. Europe Standard Time': 'Europe/Berlin',
  'W. Mongolia Standard Time': 'Asia/Hovd',
  'West Asia Standard Time': 'Asia/Tashkent',
  'West Bank Standard Time': 'Asia/Hebron',
  'West Pacific Standard Time': 'Pacific/Port_Moresby',
  'Yakutsk Standard Time': 'Asia/Yakutsk',
  'Yukon Standard Time': 'America/Whitehorse',
}

/**
 * Resolve a timezone identifier to an IANA name.
 * If tzid is already an IANA name, it is returned as-is.
 * If tzid is a Windows timezone name, the corresponding IANA name is returned.
 * Otherwise, the original tzid is returned unchanged.
 * @param {string|null} tzid
 * @returns {string|null}
 */
function resolveTimezone(tzid) {
  if (!tzid) return null
  return WINDOWS_TO_IANA[tzid] ?? tzid
}

/**
 * Pre-process raw ICS text before handing it to ical.js:
 *  1. Replace Windows timezone names (used by Outlook/Exchange) with IANA
 *     equivalents in TZID= parameters so ical.js can parse them.
 *  2. Add a VALUE=DATE parameter to bare DATE-only DTSTART / DTEND / EXDATE
 *     lines that omit it (many producers write DTSTART:20250315 instead of
 *     DTSTART;VALUE=DATE:20250315); ical.js 2.x requires VALUE=DATE to
 *     recognise all-day events correctly.
 * @param {string} icsText
 * @returns {string}
 */
function preprocessICS(icsText) {
  // 1. Windows TZ → IANA in TZID= parameters (RFC 5545 property/parameter names
  //    are case-insensitive, so match tzid= in any casing)
  let text = icsText.replace(/TZID=([^:;\r\n]+)/gi, (match, tzid) => {
    const iana = WINDOWS_TO_IANA[tzid.trim()]
    return iana ? `TZID=${iana}` : match
  })
  // 2. Add VALUE=DATE for bare 8-digit date values (no time component).
  //    RFC 5545 names are case-insensitive, so match dtstart/dtend/exdate in any casing.
  //    Also check for an existing VALUE=DATE (or value=date) param case-insensitively to
  //    avoid adding a duplicate.
  text = text.replace(/^(DTSTART|DTEND|EXDATE)([^:]*):(\d{8})\r?$/gim, (match, prop, params, date) => {
    if (params.toUpperCase().includes('VALUE=DATE')) return match
    const cr = match.endsWith('\r') ? '\r' : ''
    return params
      ? `${prop}${params};VALUE=DATE:${date}${cr}`
      : `${prop};VALUE=DATE:${date}${cr}`
  })
  return text
}

/**
 * Returns true if the given timezone identifier is recognised by day.js
 * (i.e., would NOT fall through to floating-time treatment).
 * Accepts both IANA timezone identifiers and Windows timezone names (used by Outlook).
 * @param {string} tzid
 * @returns {boolean}
 */
function isSupportedTZID(tzid) {
  if (!tzid) return false
  const resolved = resolveTimezone(tzid)
  try {
    // dayjs.tz() throws if the timezone is unknown; use a fixed reference
    // datetime that won't hit DST edge cases.
    dayjs.tz('20000101T000000', 'YYYYMMDDTHHmmss', resolved)
    return true
  } catch {
    return false
  }
}

/**
 * Convert an ical.js ICAL.Time value to a JavaScript Date.
 * Uses the raw integer fields from ICAL.Time plus dayjs for timezone
 * conversion, so ical.js does not need its own timezone database.
 *
 * @param {ICAL.Time} icalTime   - Parsed time value from an ical.js property
 * @param {string|null} tzidParam - TZID extracted from the parent property's parameters
 * @returns {Date|null}
 */
function icalTimeToDate(icalTime, tzidParam) {
  if (!icalTime) return null

  const y  = icalTime.year
  const mo = String(icalTime.month).padStart(2, '0') // ical.js months are 1-based; pad to 2 digits for the YYYYMMDD string
  const d  = String(icalTime.day).padStart(2, '0')

  if (icalTime.isDate) {
    // DATE-only (all-day event) — no timezone conversion needed
    return dayjs(`${y}${mo}${d}`, 'YYYYMMDD').toDate()
  }

  const h   = String(icalTime.hour).padStart(2, '0')
  const min = String(icalTime.minute).padStart(2, '0')
  const s   = String(icalTime.second).padStart(2, '0')
  const str = `${y}${mo}${d}T${h}${min}${s}`

  if (tzidParam) {
    // Local time in a named timezone — convert to UTC via dayjs.tz().
    // resolveTimezone() maps Windows names that were not caught by preprocessICS().
    const ianaName = resolveTimezone(tzidParam)
    try {
      return dayjs.tz(str, 'YYYYMMDDTHHmmss', ianaName).toDate()
    } catch {
      // Unknown / unsupported TZID — fall back to floating-time treatment
      return dayjs.utc(str, 'YYYYMMDDTHHmmss').toDate()
    }
  }

  // No TZID parameter: either UTC (Z suffix, zone.tzid === 'UTC') or floating
  // (no timezone at all).  In both cases the raw hour/minute values are stored
  // as-is using dayjs.utc() so they are preserved regardless of the server's
  // local timezone.
  return dayjs.utc(str, 'YYYYMMDDTHHmmss').toDate()
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
 * For FREQ=WEEKLY, BYDAY is supported (plain weekday codes).
 * For FREQ=MONTHLY, BYDAY is supported with optional positional prefixes
 * (e.g. "3FR" = third Friday, "-1MO" = last Monday, "MO" = every Monday).
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
  // UNTIL can be a UTC instant (Z suffix), a DATE-only value, or a local time
  // in the event's start timezone (RFC 5545 § 3.3.10).  Z-suffix values are
  // always treated as UTC regardless of startTzid.
  const until = (() => {
    const u = p.UNTIL
    if (!u) return null
    if (u.endsWith('Z')) return dayjs.utc(u.slice(0, 15), 'YYYYMMDDTHHmmss').toDate()
    if (u.length === 8) return dayjs(u, 'YYYYMMDD').toDate()
    if (event.startTzid) {
      try {
        return dayjs.tz(u, 'YYYYMMDDTHHmmss', event.startTzid).toDate()
      } catch {
        // fall through to UTC wall-clock treatment
      }
    }
    return dayjs.utc(u, 'YYYYMMDDTHHmmss').toDate()
  })()
  const maxCount = p.COUNT ? parseInt(p.COUNT, 10) : null

  // Parse BYDAY entries, preserving positional prefixes (e.g. "3FR" → {weekday:5, position:3},
  // "-1MO" → {weekday:1, position:-1}, "MO" → {weekday:1, position:null}).
  const byDayRules = p.BYDAY
    ? p.BYDAY
        .split(',')
        .map((d) => {
          const m = d.trim().match(/^([+-]?\d+)?([A-Z]{2})$/i)
          if (!m) return null
          const wd = RRULE_WEEKDAY[m[2].toUpperCase()]
          if (wd === undefined) return null
          return { weekday: wd, position: m[1] ? parseInt(m[1], 10) : null }
        })
        .filter(Boolean)
    : null
  // Plain weekday array used by the WEEKLY branch (positional info not needed there).
  const byDay = byDayRules ? byDayRules.map((b) => b.weekday) : null

  const duration = dayjs(event.end).diff(dayjs(event.start))

  // For timezone-aware recurring events, extract the wall-clock time (hour,
  // minute, second) of the series start in the source timezone.  This lets
  // each occurrence be converted to UTC via dayjs.tz() so that DST transitions
  // are handled correctly — e.g. an event at 12:30 "Mountain Standard Time"
  // stays at 12:30 MDT (not 12:30 MST) after the clocks spring forward.
  // Without this, all occurrences would share the fixed UTC offset of DTSTART,
  // showing an hour late (or early) after a DST change.
  let localWallClock = null
  if (event.startTzid && !event.floating) {
    const s = dayjs(event.start).tz(event.startTzid)
    localWallClock = { hour: s.hour(), minute: s.minute(), second: s.second(), tz: event.startTzid }
  }

  /**
   * Given a dayjs UTC object whose year/month/day represent the intended occurrence
   * date, return a JS Date at the correct UTC instant by applying the series
   * wall-clock time in the source timezone.  For floating/UTC events (no timezone
   * info), converts the dayjs object to a plain Date unchanged.
   * @param {import('dayjs').Dayjs} d - A dayjs UTC object for the occurrence date
   * @returns {Date}
   */
  const adjustForDST = (d) => {
    if (!localWallClock) return d.toDate()
    const y   = d.year()
    const mo  = String(d.month() + 1).padStart(2, '0')
    const day = String(d.date()).padStart(2, '0')
    const hh  = String(localWallClock.hour).padStart(2, '0')
    const mm  = String(localWallClock.minute).padStart(2, '0')
    const ss  = String(localWallClock.second).padStart(2, '0')
    try {
      return dayjs.tz(`${y}-${mo}-${day}T${hh}:${mm}:${ss}`, 'YYYY-MM-DDTHH:mm:ss', localWallClock.tz).toDate()
    } catch {
      return d.toDate()
    }
  }

  // Build a set of excluded occurrence start times (epoch ms) for fast lookup
  const exdateSet = new Set((event.exdates ?? []).map((d) => dayjs(d).valueOf()))

  const results = []
  let cursor = dayjs.utc(event.start)
  let count = 0

  // For MONTHLY+BYDAY, normalize cursor to the 1st of the event's start month.
  // This ensures the outer-loop termination checks never fire before candidates
  // for that month have been generated — a BYDAY candidate (e.g. the 3rd Friday
  // on the 18th) can be earlier in the month than the original DTSTART
  // day-of-month (e.g. the 21st).
  if (p.FREQ === 'MONTHLY' && byDayRules && byDayRules.length > 0) {
    cursor = cursor.date(1)
  }

  // Fast-forward cursor for simple (non-BYDAY) daily/weekly rules to avoid
  // iterating through years of history one step at a time.
  if (p.FREQ === 'DAILY' || (p.FREQ === 'WEEKLY' && !byDay)) {
    const periodDays = (p.FREQ === 'DAILY' ? 1 : 7) * interval
    const periodMs = periodDays * 24 * 60 * 60 * 1000
    const targetMs = dayjs(rangeStart).valueOf() - duration
    if (cursor.valueOf() < targetMs && periodDays > 0) {
      const stepsToSkip = Math.floor((targetMs - cursor.valueOf()) / periodMs)
      const skippable = maxCount !== null ? Math.min(stepsToSkip, maxCount - count) : stepsToSkip
      cursor = cursor.add(skippable * periodDays, 'day')
      count += skippable
    }
  }

  const SAFETY_CAP = 10000
  const rangeEndMs = dayjs(rangeEnd).valueOf()
  for (let iter = 0; iter < SAFETY_CAP; iter++) {
    if (maxCount !== null && count >= maxCount) break
    if (p.FREQ === 'WEEKLY' && byDay && byDay.length > 0) {
      // For WEEKLY+BYDAY: cursor is the series anchor day (DTSTART weekday),
      // not necessarily the earliest candidate in the week (e.g. DTSTART=MO
      // but BYDAY=SU,MO). Use the week's Sunday as the termination guard so
      // we don't exit the loop before generating earlier-in-week BYDAY
      // candidates that are still within the range/UNTIL window.
      const weekSunday = cursor.subtract(cursor.day(), 'day')
      if (weekSunday.valueOf() > rangeEndMs) break
      if (until && adjustForDST(weekSunday) > until) break
    } else {
      // For all other frequencies: cursor IS the candidate date. Apply the
      // DST-adjusted cursor to UNTIL so a spring-forward shift does not cause
      // the raw cursor to overshoot UNTIL by one hour and drop the final
      // occurrence prematurely.
      if (until && adjustForDST(cursor) > until) break
      if (cursor.valueOf() > rangeEndMs) break
    }

    // Collect candidate occurrence start times for this iteration
    let candidates
    if (p.FREQ === 'WEEKLY' && byDay && byDay.length > 0) {
      // Generate all matching weekdays in the week containing cursor.
      // cursor is a dayjs UTC object; .day() returns the UTC day of week (0=Sun).
      // dayjs date arithmetic preserves the time component of cursor, so no
      // separate setUTCHours call is needed: adjustForDST re-derives the UTC
      // instant for timezone-aware events, and .toDate() is returned as-is for
      // floating/UTC events (both handled inside adjustForDST).
      const sunday = cursor.subtract(cursor.day(), 'day')
      candidates = byDay
        .map((dow) => adjustForDST(sunday.add(dow, 'day')))
        .filter((d) => d >= event.start) // never before the series start
        .sort((a, b) => a - b)
    } else if (p.FREQ === 'MONTHLY' && byDayRules && byDayRules.length > 0) {
      // For MONTHLY + BYDAY, compute the Nth (or all) occurrence(s) of each
      // specified weekday within the month that cursor falls in.
      // e.g. BYDAY=3FR → third Friday; BYDAY=-1MO → last Monday; BYDAY=MO → every Monday.
      // cursor is a dayjs UTC object (normalized to day 1 of the month above).
      const daysInMonth = cursor.daysInMonth()
      const monthFirstDow = cursor.date(1).day() // UTC weekday of the 1st of this month
      candidates = byDayRules
        .flatMap(({ weekday, position }) => {
          // Find the day-of-month of the first occurrence of `weekday` in this month.
          const firstOccDay = 1 + ((weekday - monthFirstDow + 7) % 7)
          // Collect all occurrences of this weekday in the month.
          const allOccDays = []
          for (let day = firstOccDay; day <= daysInMonth; day += 7) {
            allOccDays.push(day)
          }
          let targetDays
          if (position === null) {
            // No positional prefix → every occurrence of this weekday in the month.
            targetDays = allOccDays
          } else if (position > 0) {
            // Positive: Nth from start (1 = first).
            const d = allOccDays[position - 1]
            targetDays = d !== undefined ? [d] : []
          } else {
            // Negative: Nth from end (-1 = last).
            const d = allOccDays[allOccDays.length + position]
            targetDays = d !== undefined ? [d] : []
          }
          // cursor.date(day) sets the UTC day within the same month/year,
          // preserving the time component. adjustForDST then re-derives the UTC
          // instant for timezone-aware events, or returns the UTC Date directly
          // for floating events.
          return targetDays.map((day) => adjustForDST(cursor.date(day)))
        })
        .filter((d) => d >= event.start) // never before the series start
        .sort((a, b) => a - b)
    } else {
      candidates = [adjustForDST(cursor)]
    }

    for (const occ of candidates) {
      if (until && occ > until) break
      if (maxCount !== null && count >= maxCount) break
      count++

      if (exdateSet.has(dayjs(occ).valueOf())) continue

      const occEnd = dayjs(occ).add(duration, 'millisecond').toDate()
      if (occEnd >= rangeStart && occ <= rangeEnd) {
        // eslint-disable-next-line no-unused-vars
        const { rrule: _r, exdates: _e, startTzid: _t, ...rest } = event
        results.push({ ...rest, start: occ, end: occEnd, id: `${event.id}__occ__${dayjs(occ).valueOf()}` })
      }
    }

    // Advance cursor by one recurrence period
    switch (p.FREQ) {
      case 'DAILY':
        cursor = cursor.add(interval, 'day')
        break
      case 'WEEKLY':
        cursor = cursor.add(7 * interval, 'day')
        break
      case 'MONTHLY':
        cursor = cursor.add(interval, 'month')
        break
      case 'YEARLY':
        cursor = cursor.add(interval, 'year')
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
 *
 * Uses ical.js for robust RFC 5545 structural parsing (line unfolding, property
 * parameter handling, TEXT-value unescaping, etc.) and dayjs for timezone-aware
 * date conversion.
 *
 * @param {string} icsText  - Raw ICS/iCalendar text
 * @param {string} sourceId - Plugin ID to tag each event with
 * @param {object} [options]
 * @param {function} [options.resolveStatus] - Optional vendor-specific status override.
 *   Called as `resolveStatus(status, getProp)` where `getProp(name)` returns the
 *   uppercased string value of any raw VEVENT property.  Return the desired status
 *   string or the unchanged `status` argument to keep the default.
 * @returns {Array<{id, title, start, end, allDay, description, location, status, source, rrule?, exdates?, startTzid?, floating?}>}
 */
export function parseICSData(icsText, sourceId, options = {}) {
  const preprocessed = preprocessICS(icsText)

  let jcal
  try {
    jcal = ICAL.parse(preprocessed)
  } catch {
    // Malformed ICS — return empty list rather than crashing
    return []
  }

  const comp    = new ICAL.Component(jcal)
  const vevents = comp.getAllSubcomponents('vevent')
  const events  = []

  for (const vevent of vevents) {
    // RFC 5545 defines three VEVENT statuses: TENTATIVE, CONFIRMED, CANCELLED.
    // TENTATIVE and CONFIRMED events represent real calendar time and should be
    // displayed.  Only CANCELLED events are hidden.
    const rawStatus = (vevent.getFirstPropertyValue('status') || '').trim().toUpperCase()
    if (rawStatus === 'CANCELLED') continue

    // DTSTART is required for a usable event
    const dtStartProp = vevent.getFirstProperty('dtstart')
    if (!dtStartProp) continue

    const dtstart     = dtStartProp.getFirstValue()
    const dtStartTzid = dtStartProp.getParameter('tzid') ?? null

    const dtEndProp = vevent.getFirstProperty('dtend')
    const dtend     = dtEndProp ? dtEndProp.getFirstValue() : null
    // Fall back to the start timezone for DTEND if no separate TZID is present
    const dtEndTzid = (dtEndProp?.getParameter('tzid')) ?? dtStartTzid

    const allDay = dtstart.isDate

    // A datetime is "floating" when it has no TZID parameter and no Z suffix
    // (zone.tzid === 'UTC').  Events with an unsupported/unknown TZID also fall
    // back to floating-time treatment so their wall-clock hour is preserved.
    const isUTCZone = dtstart.zone?.tzid === 'UTC'
    const floating  =
      !allDay &&
      (!dtStartTzid
        ? !isUTCZone                       // no TZID → floating unless Z suffix
        : !isSupportedTZID(dtStartTzid))   // unknown TZID → treated as floating

    const start = icalTimeToDate(dtstart, dtStartTzid)
    let   end   = dtend ? icalTimeToDate(dtend, dtEndTzid) : null
    // For all-day events with no DTEND, use the same date as the start
    if (!end) end = start

    // ATTENDEE PARTSTAT → TENTATIVE fallback.
    // Facebook "interested" events carry PARTSTAT=TENTATIVE on a single attendee
    // instead of STATUS:TENTATIVE.  Outlook unanswered invites use NEEDS-ACTION.
    // We only infer tentative from PARTSTAT for single-attendee events to avoid
    // false positives in multi-attendee meetings.
    let status = rawStatus

    // Allow each plugin to apply vendor-specific status overrides by passing
    // options.resolveStatus(currentStatus, getProp) to parseICSData.
    if (typeof options.resolveStatus === 'function') {
      const getProp = (name) =>
        (vevent.getFirstPropertyValue(name.toLowerCase()) ?? '').toString().trim().toUpperCase()
      const resolvedStatus = options.resolveStatus(status, getProp)
      if (typeof resolvedStatus === 'string') {
        status = resolvedStatus
      }
    }

    // A plugin's resolveStatus may map a vendor-specific property to CANCELLED
    // (e.g. Outlook X-MICROSOFT-CDO-BUSYSTATUS:FREE).  Skip those events the
    // same way we skip events with a raw STATUS:CANCELLED value.
    if (status === 'CANCELLED') continue

    if (!status) {
      const attendeeProps = vevent.getAllProperties('attendee')
      if (attendeeProps.length === 1) {
        const partstat = (attendeeProps[0].getParameter('partstat') || '').trim().toUpperCase()
        if (partstat === 'TENTATIVE' || partstat === 'NEEDS-ACTION') {
          status = 'TENTATIVE'
        }
      }
    }

    const uid         = vevent.getFirstPropertyValue('uid')
    const summary     = vevent.getFirstPropertyValue('summary')
    const description = vevent.getFirstPropertyValue('description')
    const location    = vevent.getFirstPropertyValue('location')

    // Deterministic fallback ID for events that do not have a UID.
    // Use the raw iCal string representations of DTSTART/DTEND so the hash
    // value stays consistent with the format the previous custom parser stored.
    const dtStartStr = dtstart.toICALString()
    const dtEndStr   = dtend ? dtend.toICALString() : ''

    const event = {
      id:
        uid ||
        `${sourceId}-${hashString(
          [sourceId, dtStartStr, dtEndStr, summary ?? '', location ?? ''].join('|'),
        )}`,
      title:       summary     || '(No title)',
      start,
      end,
      allDay:      Boolean(allDay),
      // ical.js automatically unescapes TEXT values (\n, \,, \\, etc.)
      description: description || '',
      location:    location    || '',
      status,
      source:      sourceId,
    }

    if (floating) event.floating = true

    // Store the IANA-resolved TZID so expandRRule can apply it to floating UNTIL
    // values (RFC 5545 § 3.3.10).  resolveTimezone() maps any remaining Windows
    // timezone names to IANA; for already-IANA names it returns the input unchanged.
    if (dtStartTzid) event.startTzid = resolveTimezone(dtStartTzid)

    // Recurrence rule — stored as the RFC 5545 RRULE string (e.g. "FREQ=WEEKLY;BYDAY=MO")
    // for the custom expandRRule / expandEvents functions.
    const rruleProp = vevent.getFirstProperty('rrule')
    if (rruleProp) event.rrule = rruleProp.getFirstValue().toString()

    // Excluded dates (EXDATE may appear on multiple property lines or hold
    // comma-separated values; ical.js surfaces them via getValues()).
    const exdateProps = vevent.getAllProperties('exdate')
    if (exdateProps.length > 0) {
      const exdates = []
      for (const exProp of exdateProps) {
        // Fall back to the event's start TZID when EXDATE has no explicit TZID
        const exTzid = exProp.getParameter('tzid') ?? dtStartTzid
        for (const val of exProp.getValues()) {
          const d = icalTimeToDate(val, exTzid)
          if (d) exdates.push(d)
        }
      }
      if (exdates.length > 0) event.exdates = exdates
    }

    events.push(event)
  }

  return events
}
