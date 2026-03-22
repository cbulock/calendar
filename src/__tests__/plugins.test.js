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
