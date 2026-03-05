import { describe, it, expect, vi, beforeEach } from 'vitest'
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

vi.mock('../composables/useCalendar.js', () => ({
  useCalendar: () => ({
    events: mockEvents,
    loading: mockLoading,
    error: mockError,
    enabledSources: mockEnabledSources,
    fetchEvents: mockFetchEvents,
  }),
}))

// Stub EventItem so we don't need to render its internals
const EventItemStub = defineComponent({
  name: 'EventItem',
  props: ['event'],
  template: '<div class="event-item-stub">{{ event.title }}</div>',
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

const today = new Date()
const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate())
const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)

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
  })

  it('renders today and tomorrow sections', () => {
    const wrapper = mountDayView()
    const headings = wrapper.findAll('h2, h3')
    const headingTexts = headings.map((h) => h.text())
    expect(headingTexts.some((t) => /today/i.test(t) || t.includes(todayMidnight.getDate()))).toBe(true)
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
    const todayNoon = new Date(todayMidnight)
    todayNoon.setHours(12)
    mockEvents.value = [makeEvent('e1', 'Morning standup', todayNoon)]
    const wrapper = mountDayView()
    const todaySection = wrapper.find('.day-section--today')
    expect(todaySection.text()).toContain('Morning standup')
  })

  it('renders tomorrow events in the tomorrow section', async () => {
    const tomorrowNoon = new Date(tomorrow)
    tomorrowNoon.setHours(10)
    mockEvents.value = [makeEvent('e2', 'Team lunch', tomorrowNoon)]
    const wrapper = mountDayView()
    const tomorrowSection = wrapper.find('.day-section--tomorrow')
    expect(tomorrowSection.text()).toContain('Team lunch')
  })

  it('does not show today events in the tomorrow section', async () => {
    const todayNoon = new Date(todayMidnight)
    todayNoon.setHours(12)
    mockEvents.value = [makeEvent('e1', 'Today only event', todayNoon)]
    const wrapper = mountDayView()
    const tomorrowSection = wrapper.find('.day-section--tomorrow')
    expect(tomorrowSection.text()).not.toContain('Today only event')
  })

  it('does not show tomorrow events in the today section', async () => {
    const tomorrowNoon = new Date(tomorrow)
    tomorrowNoon.setHours(10)
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
    const dayAfterTomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2)
    // start should be today's midnight
    expect(start.getDate()).toBe(todayMidnight.getDate())
    // end should be day-after-tomorrow's midnight (half-open interval covering all of tomorrow)
    expect(end.getDate()).toBe(dayAfterTomorrow.getDate())
  })
})
