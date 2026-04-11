// @vitest-environment node

/**
 * Server-side plugin registry tests.
 *
 * These tests exercise the server-side event-fetching behaviour in
 * server/plugins/index.js, which is what actually runs in production.  They
 * exist alongside the client-side plugin tests in plugins.test.js so that any
 * future divergence between the two sides is caught immediately.
 *
 * All test URLs use a bare public IP address (https://1.2.3.4/…) so that
 * Node's dns.lookup() returns the IP directly without a real DNS query, which
 * keeps tests fast and hermetic without needing to mock node:dns/promises.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { getPlugin } from '../../server/plugins/index.js'

// A public IP address that passes the SSRF validation in validateFetchUrl.
// Node's dns.lookup() passes IP address strings through without a real DNS query.
const TEST_HOST = 'https://1.2.3.4'

describe('Server Plugin Registry — Outlook', () => {
  const plugin = getPlugin('outlook')

  afterEach(() => { vi.restoreAllMocks() })

  it('plugin is registered', () => {
    expect(plugin).toBeDefined()
    expect(typeof plugin.fetchEvents).toBe('function')
  })

  it('resolves STATUS:CONFIRMED → TENTATIVE when X-MICROSOFT-CDO-BUSYSTATUS is TENTATIVE', async () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:srv-outlook-tent@test',
      'SUMMARY:Tentative',
      'DTSTART:20250401T140000Z',
      'DTEND:20250401T150000Z',
      'STATUS:CONFIRMED',
      'X-MICROSOFT-CDO-BUSYSTATUS:TENTATIVE',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, text: () => Promise.resolve(ics) })
    const dateRange = { start: new Date('2025-04-01T00:00:00Z'), end: new Date('2025-04-30T00:00:00Z') }
    const events = await plugin.fetchEvents({ icsUrl: `${TEST_HOST}/outlook.ics` }, dateRange, 'outlook-1')
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('TENTATIVE')
  })

  it('keeps STATUS:CONFIRMED when X-MICROSOFT-CDO-BUSYSTATUS is BUSY', async () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:srv-outlook-busy@test',
      'SUMMARY:Busy',
      'DTSTART:20250401T140000Z',
      'DTEND:20250401T150000Z',
      'STATUS:CONFIRMED',
      'X-MICROSOFT-CDO-BUSYSTATUS:BUSY',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, text: () => Promise.resolve(ics) })
    const dateRange = { start: new Date('2025-04-01T00:00:00Z'), end: new Date('2025-04-30T00:00:00Z') }
    const events = await plugin.fetchEvents({ icsUrl: `${TEST_HOST}/outlook.ics` }, dateRange, 'outlook-1')
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('CONFIRMED')
  })

  it('filters out a single-instance FREE event (declined/removed meeting)', async () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:srv-outlook-cancelled@test',
      'SUMMARY:Cancelled',
      'DTSTART:20250401T140000Z',
      'DTEND:20250401T150000Z',
      'STATUS:CONFIRMED',
      'X-MICROSOFT-CDO-BUSYSTATUS:FREE',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, text: () => Promise.resolve(ics) })
    const dateRange = { start: new Date('2025-04-01T00:00:00Z'), end: new Date('2025-04-30T00:00:00Z') }
    const events = await plugin.fetchEvents({ icsUrl: `${TEST_HOST}/outlook.ics` }, dateRange, 'outlook-1')
    expect(events).toHaveLength(0)
  })

  it('shows a recurring unanswered invite (INSTTYPE=1, FREE, INTENDEDSTATUS=BUSY) as TENTATIVE', async () => {
    // Regression: this combination was incorrectly filtered as CANCELLED before the fix.
    // See https://github.com/cbulock/calendar/pull/35
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:srv-outlook-recurring-tent@test',
      'SUMMARY:Recurring Unanswered',
      'RRULE:FREQ=MONTHLY;UNTIL=20270310T203000Z;INTERVAL=1;BYDAY=2WE',
      'DTSTART;TZID=US Mountain Standard Time:20260408T133000',
      'DTEND;TZID=US Mountain Standard Time:20260408T143000',
      'STATUS:CONFIRMED',
      'X-MICROSOFT-CDO-BUSYSTATUS:FREE',
      'X-MICROSOFT-CDO-INTENDEDSTATUS:BUSY',
      'X-MICROSOFT-CDO-INSTTYPE:1',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, text: () => Promise.resolve(ics) })
    const dateRange = { start: new Date('2026-04-01T00:00:00Z'), end: new Date('2026-04-30T23:59:59Z') }
    const events = await plugin.fetchEvents({ icsUrl: `${TEST_HOST}/outlook.ics` }, dateRange, 'outlook-1')
    expect(events).toHaveLength(1)
    expect(events[0].title).toBe('Recurring Unanswered')
    expect(events[0].status).toBe('TENTATIVE')
  })

  it('keeps STATUS:CONFIRMED for a transparent recurring series (INSTTYPE=1, FREE, INTENDEDSTATUS=FREE)', async () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:srv-outlook-transparent@test',
      'SUMMARY:Transparent Recurring',
      'DTSTART:20260408T140000Z',
      'DTEND:20260408T150000Z',
      'RRULE:FREQ=WEEKLY',
      'STATUS:CONFIRMED',
      'X-MICROSOFT-CDO-BUSYSTATUS:FREE',
      'X-MICROSOFT-CDO-INTENDEDSTATUS:FREE',
      'X-MICROSOFT-CDO-INSTTYPE:1',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, text: () => Promise.resolve(ics) })
    const dateRange = { start: new Date('2026-04-01T00:00:00Z'), end: new Date('2026-04-30T23:59:59Z') }
    const events = await plugin.fetchEvents({ icsUrl: `${TEST_HOST}/outlook.ics` }, dateRange, 'outlook-1')
    expect(events.length).toBeGreaterThan(0)
    expect(events[0].status).toBe('CONFIRMED')
  })

  it('still filters a single FREE event with no INSTTYPE (no recurring series exemption)', async () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:srv-outlook-free-no-insttype@test',
      'SUMMARY:Declined',
      'DTSTART:20260408T140000Z',
      'DTEND:20260408T150000Z',
      'STATUS:CONFIRMED',
      'X-MICROSOFT-CDO-BUSYSTATUS:FREE',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, text: () => Promise.resolve(ics) })
    const dateRange = { start: new Date('2026-04-01T00:00:00Z'), end: new Date('2026-04-30T23:59:59Z') }
    const events = await plugin.fetchEvents({ icsUrl: `${TEST_HOST}/outlook.ics` }, dateRange, 'outlook-1')
    expect(events).toHaveLength(0)
  })

  it('throws when the ICS fetch fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 404 })
    const dateRange = { start: new Date('2025-04-01T00:00:00Z'), end: new Date('2025-04-30T00:00:00Z') }
    await expect(
      plugin.fetchEvents({ icsUrl: `${TEST_HOST}/outlook.ics` }, dateRange, 'outlook-1'),
    ).rejects.toThrow('404')
  })
})

describe('Server Plugin Registry — Facebook Events', () => {
  const plugin = getPlugin('facebook-events')

  afterEach(() => { vi.restoreAllMocks() })

  it('plugin is registered', () => {
    expect(plugin).toBeDefined()
    expect(typeof plugin.fetchEvents).toBe('function')
  })

  it('resolves STATUS:CONFIRMED → TENTATIVE when top-level PARTSTAT is TENTATIVE', async () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:srv-fb-tent@test',
      'SUMMARY:Interested',
      'DTSTART:20250401T140000Z',
      'DTEND:20250401T150000Z',
      'STATUS:CONFIRMED',
      'PARTSTAT:TENTATIVE',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, text: () => Promise.resolve(ics) })
    const dateRange = { start: new Date('2025-04-01T00:00:00Z'), end: new Date('2025-04-30T00:00:00Z') }
    const events = await plugin.fetchEvents({ icsUrl: `${TEST_HOST}/fb.ics` }, dateRange, 'facebook-1')
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('TENTATIVE')
  })

  it('keeps STATUS:CONFIRMED when PARTSTAT is absent', async () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:srv-fb-confirmed@test',
      'SUMMARY:Going',
      'DTSTART:20250401T140000Z',
      'DTEND:20250401T150000Z',
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, text: () => Promise.resolve(ics) })
    const dateRange = { start: new Date('2025-04-01T00:00:00Z'), end: new Date('2025-04-30T00:00:00Z') }
    const events = await plugin.fetchEvents({ icsUrl: `${TEST_HOST}/fb.ics` }, dateRange, 'facebook-1')
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('CONFIRMED')
  })

  it('normalises webcal:// to https:// before fetching', async () => {
    const ics = 'BEGIN:VCALENDAR\r\nEND:VCALENDAR'
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, text: () => Promise.resolve(ics) })
    const dateRange = { start: new Date('2025-04-01T00:00:00Z'), end: new Date('2025-04-30T00:00:00Z') }
    await plugin.fetchEvents({ icsUrl: 'webcal://1.2.3.4/fb.ics' }, dateRange, 'facebook-1')
    expect(fetchSpy).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\//))
  })
})

describe('Server Plugin Registry — Proton Calendar', () => {
  const plugin = getPlugin('proton-calendar')

  afterEach(() => { vi.restoreAllMocks() })

  it('plugin is registered', () => {
    expect(plugin).toBeDefined()
    expect(typeof plugin.fetchEvents).toBe('function')
  })

  it('returns events with status from the ICS STATUS property', async () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:srv-proton-tent@test',
      'SUMMARY:Proton Tentative',
      'DTSTART:20250401T140000Z',
      'DTEND:20250401T150000Z',
      'STATUS:TENTATIVE',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, text: () => Promise.resolve(ics) })
    const dateRange = { start: new Date('2025-04-01T00:00:00Z'), end: new Date('2025-04-30T00:00:00Z') }
    const events = await plugin.fetchEvents(
      { icsUrl: `${TEST_HOST}/proton.ics` },
      dateRange,
      'proton-1',
    )
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('TENTATIVE')
  })
})

