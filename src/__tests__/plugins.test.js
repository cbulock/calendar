import { describe, it, expect, vi, afterEach } from 'vitest'
import { getAllPlugins, getPlugin, registerPlugin } from '../plugins/index.js'

describe('Plugin Registry', () => {
  it('registers built-in plugins on import', () => {
    const plugins = getAllPlugins()
    const ids = plugins.map((p) => p.id)
    expect(ids).toContain('proton-calendar')
    expect(ids).toContain('outlook')
    expect(ids).toContain('facebook-events')
  })

  it('getPlugin returns the correct plugin by id', () => {
    const plugin = getPlugin('outlook')
    expect(plugin).toBeDefined()
    expect(plugin.name).toBe('Outlook')
  })

  it('getPlugin returns undefined for unknown id', () => {
    expect(getPlugin('unknown-plugin')).toBeUndefined()
  })

  it('can register a custom plugin', () => {
    const customPlugin = {
      id: 'custom-test-plugin',
      name: 'Custom',
      description: 'Test',
      icon: '🔧',
      configFields: [],
      validateConfig: () => ({ valid: true, errors: [] }),
      fetchEvents: async () => [],
    }
    registerPlugin(customPlugin)
    expect(getPlugin('custom-test-plugin')).toBe(customPlugin)
  })

  it('throws when registering a plugin without id', () => {
    expect(() => registerPlugin({ name: 'No ID' })).toThrow()
  })
})

describe('ProtonCalendar Plugin', () => {
  const plugin = getPlugin('proton-calendar')

  it('has required fields', () => {
    expect(plugin.id).toBe('proton-calendar')
    expect(plugin.name).toBeTruthy()
    expect(plugin.icon).toBeTruthy()
    expect(Array.isArray(plugin.configFields)).toBe(true)
    expect(typeof plugin.validateConfig).toBe('function')
    expect(typeof plugin.fetchEvents).toBe('function')
  })

  it('validateConfig rejects empty config', () => {
    const result = plugin.validateConfig({})
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('validateConfig rejects invalid URL', () => {
    const result = plugin.validateConfig({ icsUrl: 'not-a-url' })
    expect(result.valid).toBe(false)
  })

  it('validateConfig rejects non-http protocol', () => {
    const result = plugin.validateConfig({ icsUrl: 'ftp://example.com/cal.ics' })
    expect(result.valid).toBe(false)
  })

  it('validateConfig accepts a valid https URL', () => {
    const result = plugin.validateConfig({ icsUrl: 'https://calendar.proton.me/api/calendar/v1/url/example' })
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })
})

describe('Outlook Plugin', () => {
  const plugin = getPlugin('outlook')

  afterEach(() => { vi.restoreAllMocks() })

  it('has required fields', () => {
    expect(plugin.id).toBe('outlook')
    expect(typeof plugin.validateConfig).toBe('function')
    expect(typeof plugin.fetchEvents).toBe('function')
  })

  it('validateConfig rejects empty config', () => {
    const result = plugin.validateConfig({})
    expect(result.valid).toBe(false)
  })

  it('validateConfig accepts valid https URL', () => {
    const result = plugin.validateConfig({ icsUrl: 'https://outlook.live.com/owa/calendar/test.ics' })
    expect(result.valid).toBe(true)
  })

  it('resolves STATUS:CONFIRMED to TENTATIVE when X-MICROSOFT-CDO-BUSYSTATUS is TENTATIVE', async () => {
    const ics = `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:outlook-tent@test\r\nSUMMARY:Tentative\r\nDTSTART:20250401T140000Z\r\nDTEND:20250401T150000Z\r\nSTATUS:CONFIRMED\r\nX-MICROSOFT-CDO-BUSYSTATUS:TENTATIVE\r\nEND:VEVENT\r\nEND:VCALENDAR`
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, text: () => Promise.resolve(ics) })
    const dateRange = { start: new Date('2025-04-01T00:00:00Z'), end: new Date('2025-04-30T00:00:00Z') }
    const events = await plugin.fetchEvents({ icsUrl: 'https://outlook.live.com/test.ics' }, dateRange)
    expect(events[0].status).toBe('TENTATIVE')
  })

  it('keeps STATUS:CONFIRMED when X-MICROSOFT-CDO-BUSYSTATUS is BUSY', async () => {
    const ics = `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:outlook-busy@test\r\nSUMMARY:Busy\r\nDTSTART:20250401T140000Z\r\nDTEND:20250401T150000Z\r\nSTATUS:CONFIRMED\r\nX-MICROSOFT-CDO-BUSYSTATUS:BUSY\r\nEND:VEVENT\r\nEND:VCALENDAR`
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, text: () => Promise.resolve(ics) })
    const dateRange = { start: new Date('2025-04-01T00:00:00Z'), end: new Date('2025-04-30T00:00:00Z') }
    const events = await plugin.fetchEvents({ icsUrl: 'https://outlook.live.com/test.ics' }, dateRange)
    expect(events[0].status).toBe('CONFIRMED')
  })

  it('filters out events where X-MICROSOFT-CDO-BUSYSTATUS is FREE (Outlook cancelled meeting)', async () => {
    const ics = `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:outlook-cancelled@test\r\nSUMMARY:Cancelled\r\nDTSTART:20250401T140000Z\r\nDTEND:20250401T150000Z\r\nSTATUS:CONFIRMED\r\nX-MICROSOFT-CDO-BUSYSTATUS:FREE\r\nEND:VEVENT\r\nEND:VCALENDAR`
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, text: () => Promise.resolve(ics) })
    const dateRange = { start: new Date('2025-04-01T00:00:00Z'), end: new Date('2025-04-30T00:00:00Z') }
    const events = await plugin.fetchEvents({ icsUrl: 'https://outlook.live.com/test.ics' }, dateRange)
    expect(events).toHaveLength(0)
  })

  it('shows a recurring unanswered invite (INSTTYPE=1, BUSYSTATUS:FREE, INTENDEDSTATUS:BUSY) as TENTATIVE', async () => {
    // Regression test: a recurring Outlook meeting invite that the recipient has not
    // yet responded to carries BUSYSTATUS:FREE (the recipient's time is still free)
    // and INTENDEDSTATUS:BUSY (the organiser intended this to block time).
    // The event must appear on the calendar as TENTATIVE — not filtered as cancelled
    // and not shown as a fully confirmed event.
    //
    // Reproduces the bug where a monthly recurring event
    // (RRULE:FREQ=MONTHLY;BYDAY=2WE) with BUSYSTATUS:FREE + INSTTYPE:1 was not
    // showing on the calendar (and when shown, was incorrectly CONFIRMED).
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Test//Test//EN',
      'BEGIN:VEVENT',
      'DESCRIPTION:Test\\n\\n',
      'RRULE:FREQ=MONTHLY;UNTIL=20270310T203000Z;INTERVAL=1;BYDAY=2WE',
      'UID:040000008200E00074C5B7101A82E008-insttype1@test',
      'SUMMARY:Test',
      'DTSTART;TZID=US Mountain Standard Time:20260408T133000',
      'DTEND;TZID=US Mountain Standard Time:20260408T143000',
      'CLASS:PUBLIC',
      'TRANSP:TRANSPARENT',
      'STATUS:CONFIRMED',
      'LOCATION:Microsoft Teams Meeting',
      'X-MICROSOFT-CDO-BUSYSTATUS:FREE',
      'X-MICROSOFT-CDO-INTENDEDSTATUS:BUSY',
      'X-MICROSOFT-CDO-INSTTYPE:1',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, text: () => Promise.resolve(ics) })
    // Range covers April 2026 — the 2nd Wednesday of April 2026 is the 8th.
    const dateRange = { start: new Date('2026-04-01T00:00:00Z'), end: new Date('2026-04-30T23:59:59Z') }
    const events = await plugin.fetchEvents({ icsUrl: 'https://outlook.live.com/test.ics' }, dateRange)
    // The series must appear as TENTATIVE; it must NOT be filtered as cancelled.
    expect(events).toHaveLength(1)
    expect(events[0].title).toBe('Test')
    expect(events[0].status).toBe('TENTATIVE')
    // DTSTART = 13:30 US Mountain Standard Time (America/Phoenix, UTC-7) = 20:30Z
    expect(events[0].start.toISOString()).toBe('2026-04-08T20:30:00.000Z')
    expect(events[0].end.toISOString()).toBe('2026-04-08T21:30:00.000Z')
  })

  it('keeps STATUS:CONFIRMED for a transparent recurring series (INSTTYPE=1, BUSYSTATUS:FREE, INTENDEDSTATUS:FREE)', async () => {
    // A recurring event the user created themselves and set as TRANSP:TRANSPARENT
    // has both BUSYSTATUS:FREE and INTENDEDSTATUS:FREE.  This is a genuinely
    // transparent event, not an unanswered invite, so status stays CONFIRMED.
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:outlook-transparent-recurring@test',
      'SUMMARY:Transparent Recurring',
      'DTSTART:20260408T140000Z',
      'DTEND:20260408T150000Z',
      'RRULE:FREQ=WEEKLY',
      'STATUS:CONFIRMED',
      'TRANSP:TRANSPARENT',
      'X-MICROSOFT-CDO-BUSYSTATUS:FREE',
      'X-MICROSOFT-CDO-INTENDEDSTATUS:FREE',
      'X-MICROSOFT-CDO-INSTTYPE:1',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, text: () => Promise.resolve(ics) })
    const dateRange = { start: new Date('2026-04-01T00:00:00Z'), end: new Date('2026-04-30T23:59:59Z') }
    const events = await plugin.fetchEvents({ icsUrl: 'https://outlook.live.com/test.ics' }, dateRange)
    expect(events.length).toBeGreaterThan(0)
    expect(events[0].status).toBe('CONFIRMED')
  })

  it('still filters out a single-instance event (no INSTTYPE) with X-MICROSOFT-CDO-BUSYSTATUS:FREE', async () => {
    // Regression guard: the INSTTYPE=1 exemption must not affect single events
    // without an INSTTYPE property — those are still treated as cancelled/declined.
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:outlook-free-no-insttype@test',
      'SUMMARY:Declined Meeting',
      'DTSTART:20260408T140000Z',
      'DTEND:20260408T150000Z',
      'STATUS:CONFIRMED',
      'X-MICROSOFT-CDO-BUSYSTATUS:FREE',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, text: () => Promise.resolve(ics) })
    const dateRange = { start: new Date('2026-04-01T00:00:00Z'), end: new Date('2026-04-30T23:59:59Z') }
    const events = await plugin.fetchEvents({ icsUrl: 'https://outlook.live.com/test.ics' }, dateRange)
    expect(events).toHaveLength(0)
  })

  it('shows a single-instance unanswered invite (INSTTYPE=0, BUSYSTATUS:FREE, INTENDEDSTATUS:BUSY) as TENTATIVE', async () => {
    // Regression: a single non-recurring meeting invite that the recipient has not
    // accepted yet carries BUSYSTATUS:FREE (time is still free on recipient's calendar)
    // and INTENDEDSTATUS:BUSY (the organiser intended to block the time slot).
    // It must appear as TENTATIVE, not be filtered as cancelled.
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:outlook-single-unanswered@test',
      'SUMMARY:Team Lunch',
      'DTSTART:20260415T120000Z',
      'DTEND:20260415T130000Z',
      'STATUS:CONFIRMED',
      'X-MICROSOFT-CDO-BUSYSTATUS:FREE',
      'X-MICROSOFT-CDO-INTENDEDSTATUS:BUSY',
      'X-MICROSOFT-CDO-INSTTYPE:0',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, text: () => Promise.resolve(ics) })
    const dateRange = { start: new Date('2026-04-01T00:00:00Z'), end: new Date('2026-04-30T23:59:59Z') }
    const events = await plugin.fetchEvents({ icsUrl: 'https://outlook.live.com/test.ics' }, dateRange)
    expect(events).toHaveLength(1)
    expect(events[0].title).toBe('Team Lunch')
    expect(events[0].status).toBe('TENTATIVE')
  })

  it('does not resurface an RFC-cancelled event when BUSYSTATUS is TENTATIVE', async () => {
    // Regression: STATUS:CANCELLED must never be overridden by BUSYSTATUS — an
    // event that Outlook has properly cancelled (STATUS:CANCELLED) should remain
    // hidden even if X-MICROSOFT-CDO-BUSYSTATUS happens to say TENTATIVE.
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:outlook-rfc-cancelled@test',
      'SUMMARY:Cancelled by organiser',
      'DTSTART:20260415T140000Z',
      'DTEND:20260415T150000Z',
      'STATUS:CANCELLED',
      'X-MICROSOFT-CDO-BUSYSTATUS:TENTATIVE',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, text: () => Promise.resolve(ics) })
    const dateRange = { start: new Date('2026-04-01T00:00:00Z'), end: new Date('2026-04-30T23:59:59Z') }
    const events = await plugin.fetchEvents({ icsUrl: 'https://outlook.live.com/test.ics' }, dateRange)
    expect(events).toHaveLength(0)
  })

  it('hides a declined single-instance meeting (INTENDEDSTATUS:BUSY, ATTENDEE PARTSTAT:DECLINED)', async () => {
    // Regression: a meeting that the recipient explicitly declined carries
    // BUSYSTATUS:FREE + INTENDEDSTATUS:BUSY (organiser still wants them there)
    // but ATTENDEE;PARTSTAT=DECLINED.  Declined meetings must be hidden, not
    // shown as TENTATIVE.
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:outlook-declined-single@test',
      'SUMMARY:Declined Meeting',
      'DTSTART:20260415T140000Z',
      'DTEND:20260415T150000Z',
      'STATUS:CONFIRMED',
      'X-MICROSOFT-CDO-BUSYSTATUS:FREE',
      'X-MICROSOFT-CDO-INTENDEDSTATUS:BUSY',
      'X-MICROSOFT-CDO-INSTTYPE:0',
      'ATTENDEE;PARTSTAT=DECLINED;ROLE=REQ-PARTICIPANT:mailto:me@example.com',
      'ORGANIZER:mailto:organizer@example.com',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, text: () => Promise.resolve(ics) })
    const dateRange = { start: new Date('2026-04-01T00:00:00Z'), end: new Date('2026-04-30T23:59:59Z') }
    const events = await plugin.fetchEvents({ icsUrl: 'https://outlook.live.com/test.ics' }, dateRange)
    expect(events).toHaveLength(0)
  })

  it('hides a declined exception occurrence of a recurring series (INSTTYPE:2, ATTENDEE PARTSTAT:DECLINED)', async () => {
    // Regression: when a specific occurrence in a recurring series is rescheduled
    // and the attendee declines the exception, it carries RECURRENCE-ID + INSTTYPE:2
    // + BUSYSTATUS:FREE + INTENDEDSTATUS:BUSY + ATTENDEE PARTSTAT:DECLINED.
    // The exception must be hidden, not shown as TENTATIVE.
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:outlook-recurring-declined@test',
      'SUMMARY:Weekly Standup',
      'DTSTART:20260408T090000Z',
      'DTEND:20260408T093000Z',
      'RRULE:FREQ=WEEKLY',
      'STATUS:CONFIRMED',
      'X-MICROSOFT-CDO-BUSYSTATUS:BUSY',
      'X-MICROSOFT-CDO-INSTTYPE:1',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:outlook-recurring-declined@test',
      'SUMMARY:Weekly Standup (rescheduled)',
      'DTSTART:20260415T100000Z',
      'DTEND:20260415T103000Z',
      'RECURRENCE-ID:20260415T090000Z',
      'STATUS:CONFIRMED',
      'X-MICROSOFT-CDO-BUSYSTATUS:FREE',
      'X-MICROSOFT-CDO-INTENDEDSTATUS:BUSY',
      'X-MICROSOFT-CDO-INSTTYPE:2',
      'ATTENDEE;PARTSTAT=DECLINED;ROLE=REQ-PARTICIPANT:mailto:me@example.com',
      'ORGANIZER:mailto:organizer@example.com',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, text: () => Promise.resolve(ics) })
    const dateRange = { start: new Date('2026-04-01T00:00:00Z'), end: new Date('2026-04-30T23:59:59Z') }
    const events = await plugin.fetchEvents({ icsUrl: 'https://outlook.live.com/test.ics' }, dateRange)
    // The declined exception must not appear; the other occurrences of the
    // series (excluding the overridden slot) should still appear.
    const declinedOccurrence = events.find((e) => e.title === 'Weekly Standup (rescheduled)')
    expect(declinedOccurrence).toBeUndefined()
  })
})

describe('Facebook Events Plugin', () => {
  const plugin = getPlugin('facebook-events')

  afterEach(() => { vi.restoreAllMocks() })

  it('has required fields', () => {
    expect(plugin.id).toBe('facebook-events')
    expect(typeof plugin.validateConfig).toBe('function')
    expect(typeof plugin.fetchEvents).toBe('function')
  })

  it('validateConfig rejects empty config', () => {
    const result = plugin.validateConfig({})
    expect(result.valid).toBe(false)
  })

  it('validateConfig accepts webcal URL', () => {
    const result = plugin.validateConfig({
      icsUrl: 'webcal://www.facebook.com/ical/u.php?uid=123&key=abc',
    })
    expect(result.valid).toBe(true)
  })

  it('validateConfig accepts https URL', () => {
    const result = plugin.validateConfig({
      icsUrl: 'https://www.facebook.com/ical/u.php?uid=123&key=abc',
    })
    expect(result.valid).toBe(true)
  })

  it('resolves STATUS:CONFIRMED to TENTATIVE when top-level PARTSTAT is TENTATIVE', async () => {
    const ics = `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:fb-tent@test\r\nSUMMARY:Interested\r\nDTSTART:20250401T140000Z\r\nDTEND:20250401T150000Z\r\nSTATUS:CONFIRMED\r\nPARTSTAT:TENTATIVE\r\nEND:VEVENT\r\nEND:VCALENDAR`
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, text: () => Promise.resolve(ics) })
    const dateRange = { start: new Date('2025-04-01T00:00:00Z'), end: new Date('2025-04-30T00:00:00Z') }
    const events = await plugin.fetchEvents({ icsUrl: 'https://www.facebook.com/ical/u.php?uid=123&key=abc' }, dateRange)
    expect(events[0].status).toBe('TENTATIVE')
  })
})
