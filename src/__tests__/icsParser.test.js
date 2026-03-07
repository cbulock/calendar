import { describe, it, expect } from 'vitest'
import { parseICSData } from '../plugins/utils/icsParser.js'

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

  it('correctly converts DTSTART with TZID to UTC', () => {
    const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:tzid-test@test
SUMMARY:New York Meeting
DTSTART;TZID=America/New_York:20250115T100000
DTEND;TZID=America/New_York:20250115T110000
END:VEVENT
END:VCALENDAR`
    const events = parseICSData(ics, 'test-source')
    const event = events.find((e) => e.id === 'tzid-test@test')
    expect(event).toBeDefined()
    expect(event.allDay).toBe(false)
    // 10:00 AM New York (EST = UTC-5) → 15:00 UTC
    expect(event.start.toISOString()).toBe('2025-01-15T15:00:00.000Z')
    expect(event.end.toISOString()).toBe('2025-01-15T16:00:00.000Z')
  })

  it('treats explicit UTC events (Z suffix) as UTC', () => {
    const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:utc-test@test
SUMMARY:UTC Event
DTSTART:20250315T140000Z
DTEND:20250315T150000Z
END:VEVENT
END:VCALENDAR`
    const events = parseICSData(ics, 'test-source')
    const event = events.find((e) => e.id === 'utc-test@test')
    expect(event).toBeDefined()
    expect(event.start.toISOString()).toBe('2025-03-15T14:00:00.000Z')
    expect(event.end.toISOString()).toBe('2025-03-15T15:00:00.000Z')
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
})
