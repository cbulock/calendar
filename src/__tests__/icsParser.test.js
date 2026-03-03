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
})
