import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CalendarGrid from '../components/CalendarGrid.vue'

function makeEvent(overrides = {}) {
  return {
    id: 'e1',
    title: 'Test Event',
    start: new Date(2024, 5, 15, 10, 0, 0), // June 15, 2024
    end: new Date(2024, 5, 15, 11, 0, 0),
    allDay: false,
    status: '',
    source: 'test',
    ...overrides,
  }
}

describe('CalendarGrid', () => {
  it('renders the month label', () => {
    const wrapper = mount(CalendarGrid, { props: { year: 2024, month: 5, events: [] } })
    expect(wrapper.find('.month-label').text()).toContain('June 2024')
  })

  it('renders day headers', () => {
    const wrapper = mount(CalendarGrid, { props: { year: 2024, month: 5, events: [] } })
    const headers = wrapper.findAll('.day-header')
    expect(headers).toHaveLength(7)
    expect(headers[0].text()).toBe('Sun')
  })

  it('renders an event chip for a matching event', () => {
    const event = makeEvent()
    const wrapper = mount(CalendarGrid, { props: { year: 2024, month: 5, events: [event] } })
    const chip = wrapper.find('.event-chip')
    expect(chip.exists()).toBe(true)
    expect(chip.text()).toBe('Test Event')
  })

  it('applies tentative class to TENTATIVE event chips', () => {
    const event = makeEvent({ status: 'TENTATIVE' })
    const wrapper = mount(CalendarGrid, { props: { year: 2024, month: 5, events: [event] } })
    const chip = wrapper.find('.event-chip')
    expect(chip.classes()).toContain('event-chip--tentative')
  })

  it('does not apply tentative class to CONFIRMED event chips', () => {
    const event = makeEvent({ status: 'CONFIRMED' })
    const wrapper = mount(CalendarGrid, { props: { year: 2024, month: 5, events: [event] } })
    const chip = wrapper.find('.event-chip')
    expect(chip.classes()).not.toContain('event-chip--tentative')
  })

  it('does not apply tentative class to events without a status', () => {
    const event = makeEvent({ status: '' })
    const wrapper = mount(CalendarGrid, { props: { year: 2024, month: 5, events: [event] } })
    const chip = wrapper.find('.event-chip')
    expect(chip.classes()).not.toContain('event-chip--tentative')
  })
})
