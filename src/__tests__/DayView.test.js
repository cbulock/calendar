import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'

// ---------------------------------------------------------------------------
// Stubs & mocks
// ---------------------------------------------------------------------------

// Mock useCalendar so we control returned events without network calls
const mockEvents = ref([])
const mockLoading = ref(false)
const mockError = ref(null)
const mockEnabledSources = ref([])
const mockFetchEvents = vi.fn()
const mockLoadSources = vi.fn()

vi.mock('../composables/useCalendar.js', () => ({
  useCalendar: () => ({
    events: mockEvents,
    loading: mockLoading,
    error: mockError,
    enabledSources: mockEnabledSources,
    fetchEvents: mockFetchEvents,
    loadSources: mockLoadSources,
  }),
}))

// Mock useTimezone to always return UTC so day-boundary logic is deterministic
// across any CI runner timezone.  midnightInTimezone / getTodayInTimezone keep
// their real implementations; only the reactive timezone ref is pinned.
vi.mock('../composables/useTimezone.js', async (importOriginal) => {
  const real = await importOriginal()
  return {
    ...real,
    useTimezone: () => ({ timezone: ref('UTC'), setTimezone: vi.fn() }),
  }
})

// Stub EventItem so we don't need to render its internals
const EventItemStub = defineComponent({
  name: 'EventItem',
  props: ['event', 'past'],
  template: '<div class="event-item-stub" :data-past="past">{{ event.title }}</div>',
})

// Import AFTER mocks are set up
const { default: DayView } = await import('../views/DayView.vue')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mountDayView() {
  return mount(DayView, {
    global: {
      stubs: { EventItem: EventItemStub },
    },
  })
}

function makeEvent(id, title, startDate, endDate = null, allDay = false) {
  return {
    id,
    title,
    start: startDate,
    end: endDate ?? startDate,
    allDay,
  }
}

// With the UTC timezone mock, DayView derives "today" from UTC wall-clock time.
// Use UTC date methods here so these module-level constants stay in sync with
// what DayView will compute, regardless of the host machine's local timezone.
const now = new Date()
const todayMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DayView', () => {
  beforeEach(() => {
    mockEvents.value = []
    mockLoading.value = false
    mockError.value = null
    mockEnabledSources.value = [{ id: 'src1', label: 'Cal', enabled: true }]
    mockFetchEvents.mockReset()
    mockLoadSources.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders today and tomorrow sections', () => {
    const wrapper = mountDayView()
    const headings = wrapper.findAll('h2, h3')
    const headingTexts = headings.map((h) => h.text())
    expect(headingTexts.some((t) => /today/i.test(t) || t.includes(todayMidnight.getUTCDate()))).toBe(true)
    expect(headingTexts.some((t) => /tomorrow/i.test(t))).toBe(true)
  })

  it('shows "No events today" when there are no today events', () => {
    const wrapper = mountDayView()
    expect(wrapper.text()).toContain('No events today')
  })

  it('shows "No events tomorrow" when there are no tomorrow events', () => {
    const wrapper = mountDayView()
    expect(wrapper.text()).toContain('No events tomorrow')
  })

  it('renders today events in the today section', async () => {
    const todayNoon = new Date(todayMidnight.getTime() + 12 * 3600_000)
    mockEvents.value = [makeEvent('e1', 'Morning standup', todayNoon)]
    const wrapper = mountDayView()
    const todaySection = wrapper.find('.day-section--today')
    expect(todaySection.text()).toContain('Morning standup')
  })

  it('renders tomorrow events in the tomorrow section', async () => {
    const tomorrowNoon = new Date(tomorrow.getTime() + 10 * 3600_000)
    mockEvents.value = [makeEvent('e2', 'Team lunch', tomorrowNoon)]
    const wrapper = mountDayView()
    const tomorrowSection = wrapper.find('.day-section--tomorrow')
    expect(tomorrowSection.text()).toContain('Team lunch')
  })

  it('does not show today events in the tomorrow section', async () => {
    const todayNoon = new Date(todayMidnight.getTime() + 12 * 3600_000)
    mockEvents.value = [makeEvent('e1', 'Today only event', todayNoon)]
    const wrapper = mountDayView()
    const tomorrowSection = wrapper.find('.day-section--tomorrow')
    expect(tomorrowSection.text()).not.toContain('Today only event')
  })

  it('does not show tomorrow events in the today section', async () => {
    const tomorrowNoon = new Date(tomorrow.getTime() + 10 * 3600_000)
    mockEvents.value = [makeEvent('e2', 'Future meeting', tomorrowNoon)]
    const wrapper = mountDayView()
    const todaySection = wrapper.find('.day-section--today')
    expect(todaySection.text()).not.toContain('Future meeting')
  })

  it('shows loading status bar when loading is true', async () => {
    mockLoading.value = true
    const wrapper = mountDayView()
    expect(wrapper.find('[role="status"]').exists()).toBe(true)
  })

  it('shows error status bar when error is set', async () => {
    mockError.value = 'Cal A: fetch failed'
    const wrapper = mountDayView()
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Cal A: fetch failed')
  })

  it('shows no-calendar message when enabledSources is empty', async () => {
    mockEnabledSources.value = []
    const wrapper = mountDayView()
    expect(wrapper.text()).toContain('No calendars configured')
  })

  it('calls fetchEvents on mount', async () => {
    mountDayView()
    expect(mockFetchEvents).toHaveBeenCalledOnce()
    const [start, end] = mockFetchEvents.mock.calls[0]
    const dayAfterTomorrowMidnight = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 2),
    )
    // start must be on or before today's UTC midnight (fetchStart = min of TZ and UTC boundaries)
    expect(start.getTime()).toBeLessThanOrEqual(todayMidnight.getTime())
    // end must be on or after day-after-tomorrow's UTC midnight (covers all of tomorrow)
    expect(end.getTime()).toBeGreaterThanOrEqual(dayAfterTomorrowMidnight.getTime())
  })

  describe('floating-time events', () => {
    // Pin the system clock to noon UTC on a Wednesday so the UTC date is
    // unambiguous regardless of the host timezone.
    const FIXED_TIME = new Date('2025-06-18T12:00:00Z') // 2025-06-18 Wednesday

    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(FIXED_TIME)
    })

    // afterEach is handled by the outer describe's afterEach (vi.useRealTimers())

    it('renders floating-time events for today in the today section', () => {
      // Floating event at 10:00 on the fixed UTC date — should appear in "today"
      const floatingStart = new Date('2025-06-18T10:00:00Z')
      const floatingEnd = new Date('2025-06-18T11:00:00Z')
      mockEvents.value = [
        { ...makeEvent('fe1', 'Floating Meeting', floatingStart, floatingEnd), floating: true },
      ]
      const wrapper = mountDayView()
      const todaySection = wrapper.find('.day-section--today')
      expect(todaySection.text()).toContain('Floating Meeting')
    })

    it('does not show floating events in tomorrow section when they fall on today (UTC)', () => {
      const floatingStart = new Date('2025-06-18T10:00:00Z')
      const floatingEnd = new Date('2025-06-18T11:00:00Z')
      mockEvents.value = [
        { ...makeEvent('fe2', 'Floating Today Only', floatingStart, floatingEnd), floating: true },
      ]
      const wrapper = mountDayView()
      const tomorrowSection = wrapper.find('.day-section--tomorrow')
      expect(tomorrowSection.text()).not.toContain('Floating Today Only')
    })

    it('renders floating events for tomorrow in the tomorrow section', () => {
      const floatingStart = new Date('2025-06-19T09:00:00Z') // next day UTC
      const floatingEnd = new Date('2025-06-19T10:00:00Z')
      mockEvents.value = [
        { ...makeEvent('fe3', 'Floating Tomorrow', floatingStart, floatingEnd), floating: true },
      ]
      const wrapper = mountDayView()
      const tomorrowSection = wrapper.find('.day-section--tomorrow')
      expect(tomorrowSection.text()).toContain('Floating Tomorrow')
    })

    it('does not show floating tomorrow events in the today section', () => {
      const floatingStart = new Date('2025-06-19T09:00:00Z')
      const floatingEnd = new Date('2025-06-19T10:00:00Z')
      mockEvents.value = [
        { ...makeEvent('fe4', 'Floating Tomorrow Only', floatingStart, floatingEnd), floating: true },
      ]
      const wrapper = mountDayView()
      const todaySection = wrapper.find('.day-section--today')
      expect(todaySection.text()).not.toContain('Floating Tomorrow Only')
    })
  })

  describe('now indicator', () => {
    const FIXED_TIME = new Date('2025-06-18T15:00:00Z') // 3:00 PM UTC

    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(FIXED_TIME)
    })

    it('shows the now indicator in the today section when there are no events', () => {
      mockEvents.value = []
      const wrapper = mountDayView()
      const todaySection = wrapper.find('.day-section--today')
      expect(todaySection.find('.now-indicator').exists()).toBe(true)
    })

    it('now indicator aria-label includes the formatted time', () => {
      mockEvents.value = []
      const wrapper = mountDayView()
      const indicator = wrapper.find('.now-indicator')
      const label = indicator.attributes('aria-label') ?? ''
      // Should start with "Now •" and contain a time component
      expect(label).toMatch(/^Now •/)
      expect(label.length).toBeGreaterThan('Now •'.length)
    })

    it('shows the now indicator in the today section when events exist', () => {
      const todayNoon = new Date('2025-06-18T12:00:00Z')
      mockEvents.value = [makeEvent('e1', 'Past Meeting', todayNoon)]
      const wrapper = mountDayView()
      const todaySection = wrapper.find('.day-section--today')
      expect(todaySection.find('.now-indicator').exists()).toBe(true)
    })

    it('does not show the now indicator in the tomorrow section', () => {
      const wrapper = mountDayView()
      const tomorrowSection = wrapper.find('.day-section--tomorrow')
      expect(tomorrowSection.find('.now-indicator').exists()).toBe(false)
    })

    it('marks past events with past=true', () => {
      // Event ended at 10 AM UTC, current time is 3 PM UTC — should be past
      const pastStart = new Date('2025-06-18T09:00:00Z')
      const pastEnd = new Date('2025-06-18T10:00:00Z')
      mockEvents.value = [makeEvent('e1', 'Past Meeting', pastStart, pastEnd)]
      const wrapper = mountDayView()
      const stub = wrapper.find('.event-item-stub')
      expect(stub.attributes('data-past')).toBe('true')
    })

    it('marks upcoming events with past=false', () => {
      // Event starts at 5 PM UTC, current time is 3 PM UTC — should not be past
      const futureStart = new Date('2025-06-18T17:00:00Z')
      const futureEnd = new Date('2025-06-18T18:00:00Z')
      mockEvents.value = [makeEvent('e1', 'Future Meeting', futureStart, futureEnd)]
      const wrapper = mountDayView()
      const stub = wrapper.find('.event-item-stub')
      expect(stub.attributes('data-past')).toBe('false')
    })

    it('places now indicator after past events and before future events', () => {
      // Past event (ended at 10 AM), future event (starts at 5 PM), current time 3 PM
      const pastStart = new Date('2025-06-18T09:00:00Z')
      const pastEnd = new Date('2025-06-18T10:00:00Z')
      const futureStart = new Date('2025-06-18T17:00:00Z')
      const futureEnd = new Date('2025-06-18T18:00:00Z')
      mockEvents.value = [
        makeEvent('e2', 'Future Meeting', futureStart, futureEnd),
        makeEvent('e1', 'Past Meeting', pastStart, pastEnd),
      ]
      const wrapper = mountDayView()
      const todaySection = wrapper.find('.day-section--today')
      const html = todaySection.html()
      // Past event should appear before the now indicator, future event after
      const pastIdx = html.indexOf('Past Meeting')
      const nowIdx = html.indexOf('now-indicator')
      const futureIdx = html.indexOf('Future Meeting')
      expect(pastIdx).toBeLessThan(nowIdx)
      expect(nowIdx).toBeLessThan(futureIdx)
    })
  })
})
