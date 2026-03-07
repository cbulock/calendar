import { describe, it, expect } from 'vitest'
import { parseICSData, expandEvents } from '../plugins/utils/icsParser.js'

const SAMPLE_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:event-001@test
SUMMARY:Team Meeting
DTSTART:20250315T100000Z
DTEND:20250315T110000Z
DESCRIPTION:Weekly sync
LOCATION:Conference Room A
END:VEVENT
BEGIN:VEVENT
UID:event-002@test
SUMMARY:All Day Event
DTSTART:20250320
DTEND:20250321
END:VEVENT
BEGIN:VEVENT
UID:event-003@test
DTSTART:20250322T080000Z
DTEND:20250322T090000Z
END:VEVENT
END:VCALENDAR`

describe('parseICSData', () => {
  it('parses timed events correctly', () => {
    const events = parseICSData(SAMPLE_ICS, 'test-source')
    const meeting = events.find((e) => e.id === 'event-001@test')
    expect(meeting).toBeDefined()
    expect(meeting.title).toBe('Team Meeting')
    expect(meeting.allDay).toBe(false)
    expect(meeting.description).toBe('Weekly sync')
    expect(meeting.location).toBe('Conference Room A')
    expect(meeting.source).toBe('test-source')
    expect(meeting.start).toBeInstanceOf(Date)
    expect(meeting.end).toBeInstanceOf(Date)
  })

  it('detects all-day events', () => {
    const events = parseICSData(SAMPLE_ICS, 'test-source')
    const allDay = events.find((e) => e.id === 'event-002@test')
    expect(allDay).toBeDefined()
    expect(allDay.allDay).toBe(true)
    expect(allDay.title).toBe('All Day Event')
  })

  it('handles events with no title', () => {
    const events = parseICSData(SAMPLE_ICS, 'test-source')
    const noTitle = events.find((e) => e.id === 'event-003@test')
    expect(noTitle).toBeDefined()
    expect(noTitle.title).toBe('(No title)')
  })

  it('tags each event with the given source id', () => {
    const events = parseICSData(SAMPLE_ICS, 'my-plugin')
    events.forEach((e) => expect(e.source).toBe('my-plugin'))
  })

  it('returns empty array for empty ICS', () => {
    const events = parseICSData('BEGIN:VCALENDAR\nEND:VCALENDAR', 'test')
    expect(events).toHaveLength(0)
  })

  it('filters out cancelled events', () => {
    const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:cancelled-event@test
SUMMARY:Cancelled Meeting
DTSTART:20250315T100000Z
DTEND:20250315T110000Z
STATUS:CANCELLED
END:VEVENT
BEGIN:VEVENT
UID:confirmed-event@test
SUMMARY:Confirmed Meeting
DTSTART:20250315T120000Z
DTEND:20250315T130000Z
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`
    const events = parseICSData(ics, 'test-source')
    expect(events).toHaveLength(1)
    expect(events[0].id).toBe('confirmed-event@test')
  })

  it('filters out cancelled events case-insensitively', () => {
    const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:cancelled-lower@test
SUMMARY:Cancelled Lower
DTSTART:20250315T100000Z
DTEND:20250315T110000Z
STATUS:cancelled
END:VEVENT
END:VCALENDAR`
    const events = parseICSData(ics, 'test-source')
    expect(events).toHaveLength(0)
  })

  it('does not filter out tentative events', () => {
    const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:tentative-event@test
SUMMARY:Tentative Meeting
DTSTART:20250315T100000Z
DTEND:20250315T110000Z
STATUS:TENTATIVE
END:VEVENT
END:VCALENDAR`
    const events = parseICSData(ics, 'test-source')
    expect(events).toHaveLength(1)
    expect(events[0].id).toBe('tentative-event@test')
  })

  it('parses STATUS:TENTATIVE and sets status field', () => {
    const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:tentative-001@test
SUMMARY:Maybe Meeting
DTSTART:20250401T140000Z
DTEND:20250401T150000Z
STATUS:TENTATIVE
END:VEVENT
END:VCALENDAR`
    const events = parseICSData(ics, 'test-source')
    expect(events[0].status).toBe('TENTATIVE')
  })

  it('sets status to empty string when STATUS is absent', () => {
    const events = parseICSData(SAMPLE_ICS, 'test-source')
    const meeting = events.find((e) => e.id === 'event-001@test')
    expect(meeting.status).toBe('')
  })

  it('parses STATUS:CONFIRMED correctly', () => {
    const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:confirmed-001@test
SUMMARY:Confirmed Meeting
DTSTART:20250401T140000Z
DTEND:20250401T150000Z
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`
    const events = parseICSData(ics, 'test-source')
    expect(events[0].status).toBe('CONFIRMED')
  })

  it('handles events with \\n in descriptions', () => {
    const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:desc-test
SUMMARY:Desc Test
DTSTART:20250101T120000Z
DTEND:20250101T130000Z
DESCRIPTION:Line one\\nLine two
END:VEVENT
END:VCALENDAR`
    const events = parseICSData(ics, 'src')
    expect(events[0].description).toBe('Line one\nLine two')
  })

  it('parses a UTC datetime (Z suffix) to the correct UTC instant', () => {
    const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:utc@test
SUMMARY:UTC Event
DTSTART:20250315T100000Z
DTEND:20250315T110000Z
END:VEVENT
END:VCALENDAR`
    const events = parseICSData(ics, 'test-source')
    expect(events[0].start.toISOString()).toBe('2025-03-15T10:00:00.000Z')
    expect(events[0].end.toISOString()).toBe('2025-03-15T11:00:00.000Z')
  })

  it('converts a TZID-qualified datetime to UTC', () => {
    // America/New_York in January observes EST (UTC-5, no DST)
    const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:tzid@test
SUMMARY:NYC Event
DTSTART;TZID=America/New_York:20250115T100000
DTEND;TZID=America/New_York:20250115T110000
END:VEVENT
END:VCALENDAR`
    const events = parseICSData(ics, 'test-source')
    expect(events[0].start.toISOString()).toBe('2025-01-15T15:00:00.000Z')
    expect(events[0].end.toISOString()).toBe('2025-01-15T16:00:00.000Z')
  })

  it('stores rrule on recurring events', () => {
    const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:recurring@test
SUMMARY:Weekly Standup
DTSTART:20230103T090000Z
DTEND:20230103T093000Z
RRULE:FREQ=WEEKLY;BYDAY=MO
END:VEVENT
END:VCALENDAR`
    const events = parseICSData(ics, 'src')
    expect(events).toHaveLength(1)
    expect(events[0].rrule).toBe('FREQ=WEEKLY;BYDAY=MO')
  })

  it('parses exdate values on recurring events', () => {
    const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:recurring-ex@test
SUMMARY:Meeting
DTSTART:20230103T090000Z
DTEND:20230103T093000Z
RRULE:FREQ=WEEKLY
EXDATE:20230110T090000Z
END:VEVENT
END:VCALENDAR`
    const events = parseICSData(ics, 'src')
    expect(events[0].exdates).toHaveLength(1)
    expect(events[0].exdates[0]).toBeInstanceOf(Date)
  })

  it('unfolds lines with LF-only line endings', () => {
    // Some ICS generators use LF + space for folding instead of CRLF + space
    const ics =
      'BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:fold@test\nSUMMARY:Folded \n title\nDTSTART:20250101T120000Z\nDTEND:20250101T130000Z\nEND:VEVENT\nEND:VCALENDAR'
    const events = parseICSData(ics, 'src')
    expect(events[0].title).toBe('Folded title')
  })
})

describe('expandEvents', () => {
  const rangeStart = new Date('2025-01-01T00:00:00Z')
  const rangeEnd = new Date('2025-03-31T23:59:59Z')

  it('passes non-recurring events through unchanged', () => {
    const events = [
      {
        id: 'one-off',
        title: 'One Off',
        start: new Date('2025-02-01T10:00:00Z'),
        end: new Date('2025-02-01T11:00:00Z'),
        allDay: false,
        source: 'test',
      },
    ]
    const result = expandEvents(events, rangeStart, rangeEnd)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('one-off')
    expect(result[0].title).toBe('One Off')
  })

  it('expands a daily recurring event', () => {
    const baseStart = new Date('2024-12-30T09:00:00Z') // before rangeStart
    const baseEnd = new Date('2024-12-30T09:30:00Z')
    const events = [
      {
        id: 'daily',
        title: 'Daily Standup',
        start: baseStart,
        end: baseEnd,
        allDay: false,
        source: 'test',
        rrule: 'FREQ=DAILY',
      },
    ]
    const result = expandEvents(events, rangeStart, rangeEnd)
    // Expect occurrences in Jan–Mar 2025 (31 + 28 + 31 = 90 days)
    expect(result.length).toBe(90)
    expect(result[0].start).toEqual(new Date('2025-01-01T09:00:00Z'))
    expect(result[0].end).toEqual(new Date('2025-01-01T09:30:00Z'))
    // IDs should be unique per occurrence
    const ids = new Set(result.map((e) => e.id))
    expect(ids.size).toBe(90)
    // rrule and exdates should not appear on expanded occurrences
    expect(result[0].rrule).toBeUndefined()
    expect(result[0].exdates).toBeUndefined()
  })

  it('expands a weekly recurring event started long ago', () => {
    // Simulates the typical Proton Calendar scenario:
    // event created 2 years ago, recurs weekly
    const baseStart = new Date('2023-01-02T10:00:00Z') // Monday, 2 years before range
    const baseEnd = new Date('2023-01-02T11:00:00Z')
    const events = [
      {
        id: 'weekly-old@proton',
        title: 'Weekly Meeting',
        start: baseStart,
        end: baseEnd,
        allDay: false,
        source: 'proton-calendar',
        rrule: 'FREQ=WEEKLY',
      },
    ]
    const result = expandEvents(events, rangeStart, rangeEnd)
    // Jan–Mar 2025 has 13 Mondays
    expect(result.length).toBe(13)
    // All occurrences are Mondays
    result.forEach((e) => expect(e.start.getUTCDay()).toBe(1))
    // All within the requested range
    result.forEach((e) => {
      expect(e.start >= rangeStart || e.end >= rangeStart).toBe(true)
      expect(e.start <= rangeEnd).toBe(true)
    })
  })

  it('expands a weekly recurring event with BYDAY', () => {
    const baseStart = new Date('2023-01-02T10:00:00Z') // Monday
    const baseEnd = new Date('2023-01-02T10:30:00Z')
    const events = [
      {
        id: 'mwf@test',
        title: 'MWF Event',
        start: baseStart,
        end: baseEnd,
        allDay: false,
        source: 'test',
        rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR',
      },
    ]
    const result = expandEvents(events, rangeStart, rangeEnd)
    // Check all are Mon/Wed/Fri
    result.forEach((e) => expect([1, 3, 5]).toContain(e.start.getUTCDay()))
    // Jan 2025: 14 Mon/Wed/Fri, Feb: 12, Mar: 13 → 39 total
    expect(result.length).toBe(39)
  })

  it('expands a monthly recurring event', () => {
    const baseStart = new Date('2024-06-15T14:00:00Z')
    const baseEnd = new Date('2024-06-15T15:00:00Z')
    const events = [
      {
        id: 'monthly@test',
        title: 'Monthly Review',
        start: baseStart,
        end: baseEnd,
        allDay: false,
        source: 'test',
        rrule: 'FREQ=MONTHLY',
      },
    ]
    const result = expandEvents(events, rangeStart, rangeEnd)
    expect(result.length).toBe(3) // Jan 15, Feb 15, Mar 15
    expect(result[0].start.toISOString()).toBe('2025-01-15T14:00:00.000Z')
    expect(result[1].start.toISOString()).toBe('2025-02-15T14:00:00.000Z')
    expect(result[2].start.toISOString()).toBe('2025-03-15T14:00:00.000Z')
  })

  it('expands a yearly recurring event', () => {
    const baseStart = new Date('2020-03-10T09:00:00Z')
    const baseEnd = new Date('2020-03-10T10:00:00Z')
    const events = [
      {
        id: 'yearly@test',
        title: 'Annual Event',
        start: baseStart,
        end: baseEnd,
        allDay: false,
        source: 'test',
        rrule: 'FREQ=YEARLY',
      },
    ]
    const result = expandEvents(events, rangeStart, rangeEnd)
    expect(result.length).toBe(1)
    expect(result[0].start.toISOString()).toBe('2025-03-10T09:00:00.000Z')
  })

  it('respects UNTIL termination', () => {
    const baseStart = new Date('2025-01-01T09:00:00Z')
    const baseEnd = new Date('2025-01-01T09:30:00Z')
    const events = [
      {
        id: 'until@test',
        title: 'Limited Series',
        start: baseStart,
        end: baseEnd,
        allDay: false,
        source: 'test',
        rrule: 'FREQ=DAILY;UNTIL=20250110T000000Z',
      },
    ]
    const result = expandEvents(events, rangeStart, rangeEnd)
    // UNTIL=20250110T000000Z: the Jan 10 occurrence at 09:00Z is after the UNTIL, so only Jan 1–9
    expect(result.length).toBe(9) // Jan 1–9
  })

  it('respects COUNT termination', () => {
    const baseStart = new Date('2025-01-01T09:00:00Z')
    const baseEnd = new Date('2025-01-01T09:30:00Z')
    const events = [
      {
        id: 'count@test',
        title: 'Counted Series',
        start: baseStart,
        end: baseEnd,
        allDay: false,
        source: 'test',
        rrule: 'FREQ=DAILY;COUNT=5',
      },
    ]
    const result = expandEvents(events, rangeStart, rangeEnd)
    expect(result.length).toBe(5) // Jan 1–5
  })

  it('respects COUNT when history is before the range', () => {
    // Event started before rangeStart; only 3 total occurrences
    const baseStart = new Date('2024-12-30T09:00:00Z')
    const baseEnd = new Date('2024-12-30T09:30:00Z')
    const events = [
      {
        id: 'count-history@test',
        title: 'Short Series',
        start: baseStart,
        end: baseEnd,
        allDay: false,
        source: 'test',
        rrule: 'FREQ=DAILY;COUNT=3',
      },
    ]
    const result = expandEvents(events, rangeStart, rangeEnd)
    // Dec 30, Dec 31 are before rangeStart; only Jan 1 is within range
    expect(result.length).toBe(1)
    expect(result[0].start.toISOString()).toBe('2025-01-01T09:00:00.000Z')
  })

  it('excludes EXDATE occurrences', () => {
    const baseStart = new Date('2025-01-06T10:00:00Z') // Monday
    const baseEnd = new Date('2025-01-06T11:00:00Z')
    const skipDate = new Date('2025-01-13T10:00:00Z') // next Monday — excluded
    const events = [
      {
        id: 'exdate@test',
        title: 'Weekly with Skip',
        start: baseStart,
        end: baseEnd,
        allDay: false,
        source: 'test',
        rrule: 'FREQ=WEEKLY',
        exdates: [skipDate],
      },
    ]
    const result = expandEvents(events, rangeStart, rangeEnd)
    const starts = result.map((e) => e.start.toISOString())
    expect(starts).not.toContain('2025-01-13T10:00:00.000Z')
    // Jan 6 should still be included
    expect(starts).toContain('2025-01-06T10:00:00.000Z')
  })

  it('handles INTERVAL > 1', () => {
    const baseStart = new Date('2025-01-01T09:00:00Z')
    const baseEnd = new Date('2025-01-01T09:30:00Z')
    const events = [
      {
        id: 'biweekly@test',
        title: 'Bi-Weekly',
        start: baseStart,
        end: baseEnd,
        allDay: false,
        source: 'test',
        rrule: 'FREQ=WEEKLY;INTERVAL=2',
      },
    ]
    const result = expandEvents(events, rangeStart, rangeEnd)
    // Jan 1, Jan 15, Jan 29, Feb 12, Feb 26, Mar 12, Mar 26 = 7 occurrences
    expect(result.length).toBe(7)
  })
})

