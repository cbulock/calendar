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

  it('normalises STATUS values with surrounding whitespace to TENTATIVE', () => {
    // Some ICS generators emit STATUS: TENTATIVE (with a space after the colon).
    // RFC 5545 says the value starts immediately after the colon, so the space is
    // part of the value string returned by ical.js.  .trim() strips it so the
    // strict === 'TENTATIVE' comparison still matches.
    const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:tentative-ws@test
SUMMARY:Whitespace Status
DTSTART:20250401T140000Z
DTEND:20250401T150000Z
STATUS: TENTATIVE
END:VEVENT
END:VCALENDAR`
    const events = parseICSData(ics, 'test-source')
    expect(events[0].status).toBe('TENTATIVE')
  })

  it('normalises STATUS values with surrounding whitespace to CANCELLED (and filters the event)', () => {
    const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:cancelled-ws@test
SUMMARY:Whitespace Cancelled
DTSTART:20250401T140000Z
DTEND:20250401T150000Z
STATUS: CANCELLED
END:VEVENT
END:VCALENDAR`
    const events = parseICSData(ics, 'test-source')
    expect(events).toHaveLength(0)
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

  it('sets status to TENTATIVE when ATTENDEE PARTSTAT is TENTATIVE and no STATUS is set (Facebook "interested")', () => {
    const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:fb-interested@test
SUMMARY:Interested Event
DTSTART:20250401T140000Z
DTEND:20250401T150000Z
ATTENDEE;PARTSTAT=TENTATIVE;CN=Test User:mailto:user@example.com
END:VEVENT
END:VCALENDAR`
    const events = parseICSData(ics, 'test-source')
    expect(events[0].status).toBe('TENTATIVE')
  })

  it('sets status to TENTATIVE when ATTENDEE PARTSTAT is NEEDS-ACTION and no STATUS is set (Outlook unanswered invite)', () => {
    const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:outlook-unconfirmed@test
SUMMARY:Unconfirmed Meeting
DTSTART:20250401T140000Z
DTEND:20250401T150000Z
ATTENDEE;PARTSTAT=NEEDS-ACTION;ROLE=REQ-PARTICIPANT:mailto:user@example.com
END:VEVENT
END:VCALENDAR`
    const events = parseICSData(ics, 'test-source')
    expect(events[0].status).toBe('TENTATIVE')
  })

  it('sets status to TENTATIVE when ATTENDEE PARTSTAT has surrounding whitespace (e.g. PARTSTAT= TENTATIVE)', () => {
    // Some ICS generators emit PARTSTAT= TENTATIVE (space before value).
    // .trim() is required so the padded value still matches 'TENTATIVE'.
    const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:fb-partstat-ws@test
SUMMARY:Whitespace PARTSTAT Event
DTSTART:20250401T140000Z
DTEND:20250401T150000Z
ATTENDEE;PARTSTAT= TENTATIVE;CN=Test User:mailto:user@example.com
END:VEVENT
END:VCALENDAR`
    const events = parseICSData(ics, 'test-source')
    expect(events[0].status).toBe('TENTATIVE')
  })

  it('does not override explicit STATUS with ATTENDEE PARTSTAT', () => {
    const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:confirmed-with-attendee@test
SUMMARY:Confirmed Meeting
DTSTART:20250401T140000Z
DTEND:20250401T150000Z
STATUS:CONFIRMED
ATTENDEE;PARTSTAT=TENTATIVE;CN=Other User:mailto:other@example.com
END:VEVENT
END:VCALENDAR`
    const events = parseICSData(ics, 'test-source')
    expect(events[0].status).toBe('CONFIRMED')
  })

  it('does not set tentative for ATTENDEE PARTSTAT=ACCEPTED', () => {
    const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:fb-going@test
SUMMARY:Going Event
DTSTART:20250401T140000Z
DTEND:20250401T150000Z
ATTENDEE;PARTSTAT=ACCEPTED;CN=Test User:mailto:user@example.com
END:VEVENT
END:VCALENDAR`
    const events = parseICSData(ics, 'test-source')
    expect(events[0].status).toBe('')
  })

  it('overrides STATUS:CONFIRMED to TENTATIVE when X-MICROSOFT-CDO-BUSYSTATUS is TENTATIVE (Outlook tentative invite)', () => {
    const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:outlook-tentative@test
SUMMARY:Outlook Tentative Meeting
DTSTART:20250401T140000Z
DTEND:20250401T150000Z
STATUS:CONFIRMED
X-MICROSOFT-CDO-BUSYSTATUS:TENTATIVE
END:VEVENT
END:VCALENDAR`
    const events = parseICSData(ics, 'test-source', {
      resolveStatus(status, getProp) {
        if (getProp('x-microsoft-cdo-busystatus') === 'TENTATIVE') return 'TENTATIVE'
        return status
      },
    })
    expect(events[0].status).toBe('TENTATIVE')
  })

  it('does not change status when X-MICROSOFT-CDO-BUSYSTATUS is not TENTATIVE', () => {
    const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:outlook-busy@test
SUMMARY:Outlook Busy Meeting
DTSTART:20250401T140000Z
DTEND:20250401T150000Z
STATUS:CONFIRMED
X-MICROSOFT-CDO-BUSYSTATUS:BUSY
END:VEVENT
END:VCALENDAR`
    const events = parseICSData(ics, 'test-source', {
      resolveStatus(status, getProp) {
        if (getProp('x-microsoft-cdo-busystatus') === 'TENTATIVE') return 'TENTATIVE'
        return status
      },
    })
    expect(events[0].status).toBe('CONFIRMED')
  })

  it('overrides STATUS:CONFIRMED to TENTATIVE when top-level PARTSTAT is TENTATIVE (Facebook tentative event)', () => {
    const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:fb-tentative@test
SUMMARY:Facebook Tentative Event
DTSTART:20250401T140000Z
DTEND:20250401T150000Z
STATUS:CONFIRMED
PARTSTAT:TENTATIVE
END:VEVENT
END:VCALENDAR`
    const events = parseICSData(ics, 'test-source', {
      resolveStatus(status, getProp) {
        if (getProp('partstat') === 'TENTATIVE') return 'TENTATIVE'
        return status
      },
    })
    expect(events[0].status).toBe('TENTATIVE')
  })

  it('does not set tentative from PARTSTAT when there are multiple ATTENDEE lines (avoids false positives in multi-attendee meetings)', () => {
    const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:multi-attendee@test
SUMMARY:Team Meeting
DTSTART:20250401T140000Z
DTEND:20250401T150000Z
ATTENDEE;PARTSTAT=NEEDS-ACTION;ROLE=REQ-PARTICIPANT:mailto:you@example.com
ATTENDEE;PARTSTAT=ACCEPTED;ROLE=REQ-PARTICIPANT:mailto:other@example.com
END:VEVENT
END:VCALENDAR`
    const events = parseICSData(ics, 'test-source')
    expect(events[0].status).toBe('')
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

  it('does not mark UTC (Z suffix) events as floating', () => {
    const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:utc-nofloat@test
SUMMARY:UTC Event
DTSTART:20250315T100000Z
DTEND:20250315T110000Z
END:VEVENT
END:VCALENDAR`
    const events = parseICSData(ics, 'test-source')
    expect(events[0].floating).toBeFalsy()
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

  it('does not mark TZID-qualified events as floating', () => {
    const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:tzid-nofloat@test
SUMMARY:NYC Event
DTSTART;TZID=America/New_York:20250115T100000
DTEND;TZID=America/New_York:20250115T110000
END:VEVENT
END:VCALENDAR`
    const events = parseICSData(ics, 'test-source')
    expect(events[0].floating).toBeFalsy()
  })

  it('marks floating-time events (no TZID, no Z) with floating: true', () => {
    const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:floating@test
SUMMARY:Floating Event
DTSTART:20250315T100000
DTEND:20250315T110000
END:VEVENT
END:VCALENDAR`
    const events = parseICSData(ics, 'test-source')
    expect(events[0].floating).toBe(true)
  })

  it('marks events with an unknown/unsupported TZID as floating: true', () => {
    // An unrecognised TZID falls through to UTC wall-clock storage in parseICSDate;
    // the event must also be flagged as floating so the UI filters/renders it correctly.
    const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:bad-tzid@test
SUMMARY:Bad TZID Event
DTSTART;TZID=Not/A_Real_Timezone:20250315T100000
DTEND;TZID=Not/A_Real_Timezone:20250315T110000
END:VEVENT
END:VCALENDAR`
    const events = parseICSData(ics, 'test-source')
    expect(events[0].floating).toBe(true)
    // Times should be stored as wall-clock UTC, not shifted by an unknown offset
    expect(events[0].start.toISOString()).toBe('2025-03-15T10:00:00.000Z')
  })

  it('converts a Windows timezone name (Outlook) to the correct UTC instant', () => {
    // Outlook ICS files use Windows timezone names like "Eastern Standard Time"
    // instead of IANA names like "America/New_York".
    // January observes EST (UTC-5, no DST), so 10:00 local → 15:00 UTC.
    const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:outlook-tz@test
SUMMARY:Outlook Event
DTSTART;TZID=Eastern Standard Time:20250115T100000
DTEND;TZID=Eastern Standard Time:20250115T110000
END:VEVENT
END:VCALENDAR`
    const events = parseICSData(ics, 'test-source')
    expect(events[0].start.toISOString()).toBe('2025-01-15T15:00:00.000Z')
    expect(events[0].end.toISOString()).toBe('2025-01-15T16:00:00.000Z')
  })

  it('does not mark Outlook Windows-timezone events as floating', () => {
    const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:outlook-tz-nofloat@test
SUMMARY:Outlook Event
DTSTART;TZID=Eastern Standard Time:20250115T100000
DTEND;TZID=Eastern Standard Time:20250115T110000
END:VEVENT
END:VCALENDAR`
    const events = parseICSData(ics, 'test-source')
    expect(events[0].floating).toBeFalsy()
  })

  it('converts other common Windows timezone names correctly', () => {
    // Pacific Standard Time: January observes PST (UTC-8), 15:00 local → 23:00 UTC
    const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:outlook-pacific@test
SUMMARY:Pacific Event
DTSTART;TZID=Pacific Standard Time:20250115T150000
DTEND;TZID=Pacific Standard Time:20250115T160000
END:VEVENT
END:VCALENDAR`
    const events = parseICSData(ics, 'test-source')
    expect(events[0].start.toISOString()).toBe('2025-01-15T23:00:00.000Z')
    expect(events[0].end.toISOString()).toBe('2025-01-16T00:00:00.000Z')
    expect(events[0].floating).toBeFalsy()
  })

  it('stores floating-time wall-clock hours/minutes in UTC', () => {
    // A floating "10:00" event must be stored with T10:00:00Z so that the client
    // can display it at "10:00" regardless of the user's UTC offset.
    const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:floating-utc@test
SUMMARY:Floating Event
DTSTART:20250315T100000
DTEND:20250315T110000
END:VEVENT
END:VCALENDAR`
    const events = parseICSData(ics, 'test-source')
    expect(events[0].start.toISOString()).toBe('2025-03-15T10:00:00.000Z')
    expect(events[0].end.toISOString()).toBe('2025-03-15T11:00:00.000Z')
  })

  it('does not mark all-day events as floating', () => {
    const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:allday-nofloat@test
SUMMARY:All Day Event
DTSTART:20250320
DTEND:20250321
END:VEVENT
END:VCALENDAR`
    const events = parseICSData(ics, 'test-source')
    expect(events[0].floating).toBeFalsy()
    expect(events[0].allDay).toBe(true)
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

  it('handles lowercase property names (case-insensitive ICS per RFC 5545)', () => {
    // Some ICS generators emit lowercase property names; RFC 5545 says they are
    // case-insensitive, so preprocessing must handle dtstart, dtend, tzid= etc.
    const ics = `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nuid:lower-case@test\r\nsummary:Lower Case Event\r\ndtstart:20250315T100000Z\r\ndtend:20250315T110000Z\r\nEND:VEVENT\r\nEND:VCALENDAR`
    const events = parseICSData(ics, 'test-source')
    expect(events).toHaveLength(1)
    expect(events[0].title).toBe('Lower Case Event')
    expect(events[0].allDay).toBe(false)
  })

  it('detects all-day events with lowercase dtstart (case-insensitive)', () => {
    // preprocessICS must match dtstart (lowercase) when adding VALUE=DATE
    const ics = `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:lower-allday@test\r\nSUMMARY:Lowercase All Day\r\ndtstart:20250315\r\ndtend:20250316\r\nEND:VEVENT\r\nEND:VCALENDAR`
    const events = parseICSData(ics, 'test-source')
    expect(events).toHaveLength(1)
    expect(events[0].allDay).toBe(true)
  })

  it('converts a Windows timezone with lowercase tzid= parameter', () => {
    // RFC 5545 is case-insensitive for parameter names; preprocessICS must match tzid= (lowercase)
    const ics = `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:lower-tzid@test\r\nSUMMARY:Lowercase TZID\r\nDTSTART;tzid=Eastern Standard Time:20250115T100000\r\nDTEND;tzid=Eastern Standard Time:20250115T110000\r\nEND:VEVENT\r\nEND:VCALENDAR`
    const events = parseICSData(ics, 'test-source')
    expect(events).toHaveLength(1)
    // Eastern Standard Time = UTC-5; 10:00 local → 15:00 UTC
    expect(events[0].start.toISOString()).toBe('2025-01-15T15:00:00.000Z')
    expect(events[0].floating).toBeFalsy()
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

  it('preserves the floating flag on non-recurring events', () => {
    const events = [
      {
        id: 'floating-one-off',
        title: 'Floating One Off',
        start: new Date('2025-02-01T10:00:00Z'),
        end: new Date('2025-02-01T11:00:00Z'),
        allDay: false,
        floating: true,
        source: 'test',
      },
    ]
    const result = expandEvents(events, rangeStart, rangeEnd)
    expect(result).toHaveLength(1)
    expect(result[0].floating).toBe(true)
  })

  it('preserves the floating flag on expanded recurring events', () => {
    const events = [
      {
        id: 'floating-daily',
        title: 'Floating Daily',
        start: new Date('2025-01-01T09:00:00Z'),
        end: new Date('2025-01-01T09:30:00Z'),
        allDay: false,
        floating: true,
        source: 'test',
        rrule: 'FREQ=DAILY;COUNT=3',
      },
    ]
    const result = expandEvents(events, rangeStart, rangeEnd)
    expect(result).toHaveLength(3)
    result.forEach((e) => expect(e.floating).toBe(true))
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

  it('expands FREQ=MONTHLY with positional BYDAY (3rd Friday)', () => {
    // DTSTART is Dec 20 2024 (3rd Friday of December 2024), before rangeStart
    const baseStart = new Date('2024-12-20T09:00:00Z') // Friday
    const baseEnd = new Date('2024-12-20T09:30:00Z')
    const events = [
      {
        id: 'monthly-3fr@test',
        title: '3rd Friday Monthly',
        start: baseStart,
        end: baseEnd,
        allDay: false,
        source: 'test',
        rrule: 'FREQ=MONTHLY;BYDAY=3FR',
      },
    ]
    // Range Jan–Mar 2025
    const result = expandEvents(events, rangeStart, rangeEnd)
    // 3rd Fridays: Jan 17, Feb 21, Mar 21
    expect(result.length).toBe(3)
    expect(result[0].start.toISOString()).toBe('2025-01-17T09:00:00.000Z')
    expect(result[1].start.toISOString()).toBe('2025-02-21T09:00:00.000Z')
    expect(result[2].start.toISOString()).toBe('2025-03-21T09:00:00.000Z')
    // All should be Fridays (UTC day 5)
    result.forEach((e) => expect(e.start.getUTCDay()).toBe(5))
  })

  it('expands FREQ=MONTHLY with last-weekday BYDAY (-1MO = last Monday)', () => {
    // DTSTART is Jan 27 2025 (last Monday of January)
    const baseStart = new Date('2025-01-27T10:00:00Z')
    const baseEnd = new Date('2025-01-27T11:00:00Z')
    const events = [
      {
        id: 'monthly-last-mon@test',
        title: 'Last Monday Monthly',
        start: baseStart,
        end: baseEnd,
        allDay: false,
        source: 'test',
        rrule: 'FREQ=MONTHLY;BYDAY=-1MO',
      },
    ]
    const result = expandEvents(events, rangeStart, rangeEnd)
    // Last Mondays: Jan 27, Feb 24, Mar 31
    expect(result.length).toBe(3)
    expect(result[0].start.toISOString()).toBe('2025-01-27T10:00:00.000Z')
    expect(result[1].start.toISOString()).toBe('2025-02-24T10:00:00.000Z')
    expect(result[2].start.toISOString()).toBe('2025-03-31T10:00:00.000Z')
    // All should be Mondays (UTC day 1)
    result.forEach((e) => expect(e.start.getUTCDay()).toBe(1))
  })

  it('expands FREQ=MONTHLY with unpositioned BYDAY (every Friday of the month)', () => {
    // DTSTART is Jan 3 2025 (first Friday of January)
    const baseStart = new Date('2025-01-03T09:00:00Z')
    const baseEnd = new Date('2025-01-03T09:30:00Z')
    const events = [
      {
        id: 'monthly-all-fri@test',
        title: 'All Fridays Monthly',
        start: baseStart,
        end: baseEnd,
        allDay: false,
        source: 'test',
        rrule: 'FREQ=MONTHLY;BYDAY=FR',
      },
    ]
    // Range Jan 2025 only
    const result = expandEvents(
      events,
      new Date('2025-01-01T00:00:00Z'),
      new Date('2025-01-31T23:59:59Z'),
    )
    // January 2025 Fridays: Jan 3, 10, 17, 24, 31
    expect(result.length).toBe(5)
    result.forEach((e) => expect(e.start.getUTCDay()).toBe(5))
  })

  it('adjusts FREQ=WEEKLY+BYDAY occurrence times across a DST boundary (Mountain Standard Time)', () => {
    // Reproduces the bug report: event starts before US DST (March 8, 2026) at
    // 12:30 Mountain Standard Time = 19:30 UTC.  After DST the wall-clock time
    // should stay at 12:30 Mountain Daylight Time = 18:30 UTC, not 19:30 UTC.
    const ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:040000008200E00074C5B7101A82E00800000000E1DAB12BABA5DC01@test
SUMMARY:Test
DTSTART;TZID=Mountain Standard Time:20260305T123000
DTEND;TZID=Mountain Standard Time:20260305T130000
RRULE:FREQ=WEEKLY;UNTIL=20260402T183000Z;INTERVAL=1;BYDAY=TH;WKST=SU
END:VEVENT
END:VCALENDAR`
    const parsed = parseICSData(ics, 'test')
    const result = expandEvents(
      parsed,
      new Date('2026-03-01T00:00:00Z'),
      new Date('2026-04-30T23:59:59Z'),
    )
    // 5 Thursdays: Mar 5, Mar 12, Mar 19, Mar 26, Apr 2
    expect(result.length).toBe(5)
    // Mar 5: before DST  → 12:30 MST (UTC-7) = 19:30 UTC
    expect(result[0].start.toISOString()).toBe('2026-03-05T19:30:00.000Z')
    // Mar 12 onward: after DST → 12:30 MDT (UTC-6) = 18:30 UTC, NOT 19:30 UTC
    expect(result[1].start.toISOString()).toBe('2026-03-12T18:30:00.000Z')
    expect(result[2].start.toISOString()).toBe('2026-03-19T18:30:00.000Z')
    expect(result[3].start.toISOString()).toBe('2026-03-26T18:30:00.000Z')
    // Apr 2: UNTIL=20260402T183000Z — occurrence at 18:30 UTC exactly hits the limit, included
    expect(result[4].start.toISOString()).toBe('2026-04-02T18:30:00.000Z')
  })

  it('adjusts FREQ=WEEKLY (no BYDAY) occurrence times across a DST boundary', () => {
    // Same scenario but without BYDAY — uses the simple cursor path
    const ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:weekly-no-byday-dst@test
SUMMARY:Test
DTSTART;TZID=America/New_York:20260305T143000
DTEND;TZID=America/New_York:20260305T150000
RRULE:FREQ=WEEKLY;COUNT=4
END:VEVENT
END:VCALENDAR`
    const parsed = parseICSData(ics, 'test')
    const result = expandEvents(
      parsed,
      new Date('2026-03-01T00:00:00Z'),
      new Date('2026-04-30T23:59:59Z'),
    )
    // 4 Thursdays starting Mar 5: Mar 5, Mar 12, Mar 19, Mar 26
    expect(result.length).toBe(4)
    // Mar 5: before DST → 14:30 EST (UTC-5) = 19:30 UTC
    expect(result[0].start.toISOString()).toBe('2026-03-05T19:30:00.000Z')
    // Mar 12+: after DST → 14:30 EDT (UTC-4) = 18:30 UTC
    expect(result[1].start.toISOString()).toBe('2026-03-12T18:30:00.000Z')
    expect(result[2].start.toISOString()).toBe('2026-03-19T18:30:00.000Z')
    expect(result[3].start.toISOString()).toBe('2026-03-26T18:30:00.000Z')
  })

  it('reproduces the bug report: FREQ=MONTHLY;BYDAY=3FR shows on correct day', () => {
    // From issue: DTSTART;TZID=Central Standard Time:20250321T133000
    // Central Standard Time = America/Chicago; March 21 observes CDT (UTC-5) → 18:30Z
    const ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:040000008200E00074C5B7101A82E008@test
SUMMARY:Test
DTSTART;TZID=Central Standard Time:20250321T133000
DTEND;TZID=Central Standard Time:20250321T140000
RRULE:FREQ=MONTHLY;UNTIL=20270319T183000Z;INTERVAL=1;BYDAY=3FR
END:VEVENT
END:VCALENDAR`
    const parsed = parseICSData(ics, 'test')
    const result = expandEvents(
      parsed,
      new Date('2025-03-01T00:00:00Z'),
      new Date('2025-05-31T23:59:59Z'),
    )
    // 3rd Fridays in Mar–May 2025: Mar 21, Apr 18, May 16 — all must be Friday (UTC day 5)
    expect(result.length).toBe(3)
    result.forEach((e) => expect(e.start.getUTCDay()).toBe(5))
    expect(result[0].start.toISOString()).toBe('2025-03-21T18:30:00.000Z')
    expect(result[1].start.toISOString()).toBe('2025-04-18T18:30:00.000Z')
    expect(result[2].start.toISOString()).toBe('2025-05-16T18:30:00.000Z')
  })
})

