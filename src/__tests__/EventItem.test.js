import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import EventItem from '../components/EventItem.vue'

function makeEvent(overrides = {}) {
  return {
    id: 'e1',
    title: 'Test Event',
    start: '2024-06-15T10:00:00',
    end: '2024-06-15T11:30:00',
    allDay: false,
    ...overrides,
  }
}

describe('EventItem', () => {
  it('shows the event title', () => {
    const wrapper = mount(EventItem, { props: { event: makeEvent() } })
    expect(wrapper.find('.event-item__title').text()).toBe('Test Event')
  })

  it('shows the start time', () => {
    const wrapper = mount(EventItem, { props: { event: makeEvent() } })
    expect(wrapper.find('.event-item__time').exists()).toBe(true)
    // Should NOT contain an em dash (no start–end range)
    expect(wrapper.find('.event-item__time').text()).not.toContain('–')
  })

  it('shows the duration', () => {
    const wrapper = mount(EventItem, { props: { event: makeEvent() } })
    expect(wrapper.find('.event-item__duration').text()).toBe('1 hr 30 min')
  })

  it('shows duration in minutes only for short events', () => {
    const event = makeEvent({ end: '2024-06-15T10:45:00' })
    const wrapper = mount(EventItem, { props: { event } })
    expect(wrapper.find('.event-item__duration').text()).toBe('45 min')
  })

  it('shows duration in hours only when no remaining minutes', () => {
    const event = makeEvent({ end: '2024-06-15T12:00:00' })
    const wrapper = mount(EventItem, { props: { event } })
    expect(wrapper.find('.event-item__duration').text()).toBe('2 hr')
  })

  it('shows "All day" for all-day events', () => {
    const event = makeEvent({ allDay: true })
    const wrapper = mount(EventItem, { props: { event } })
    expect(wrapper.find('.event-item__time--allday').text()).toBe('All day')
  })

  it('hides duration for all-day events', () => {
    const event = makeEvent({ allDay: true })
    const wrapper = mount(EventItem, { props: { event } })
    expect(wrapper.find('.event-item__duration').exists()).toBe(false)
  })

  it('hides duration when end equals start', () => {
    const event = makeEvent({ end: '2024-06-15T10:00:00' })
    const wrapper = mount(EventItem, { props: { event } })
    expect(wrapper.find('.event-item__duration').exists()).toBe(false)
  })

  it('hides duration when end is invalid', () => {
    const event = makeEvent({ end: 'not-a-date' })
    const wrapper = mount(EventItem, { props: { event } })
    expect(wrapper.find('.event-item__duration').exists()).toBe(false)
  })

  it('shows "1 min" for very short events (less than 60s)', () => {
    const event = makeEvent({ end: '2024-06-15T10:00:29' })
    const wrapper = mount(EventItem, { props: { event } })
    expect(wrapper.find('.event-item__duration').text()).toBe('1 min')
  })

  it('floors partial minutes rather than rounding (59m59s → 59 min, not 1 hr)', () => {
    const event = makeEvent({ end: '2024-06-15T10:59:59' })
    const wrapper = mount(EventItem, { props: { event } })
    expect(wrapper.find('.event-item__duration').text()).toBe('59 min')
  })

  it('does not show location', () => {
    const event = makeEvent({ location: 'Conference Room A' })
    const wrapper = mount(EventItem, { props: { event } })
    expect(wrapper.text()).not.toContain('Conference Room A')
  })

  it('does not show description', () => {
    const event = makeEvent({ description: 'Discuss quarterly results' })
    const wrapper = mount(EventItem, { props: { event } })
    expect(wrapper.text()).not.toContain('Discuss quarterly results')
  })

  it('applies tentative class for TENTATIVE events', () => {
    const event = makeEvent({ status: 'TENTATIVE' })
    const wrapper = mount(EventItem, { props: { event } })
    expect(wrapper.find('.event-item').classes()).toContain('event-item--tentative')
  })

  it('does not apply tentative class for non-tentative events', () => {
    const wrapper = mount(EventItem, { props: { event: makeEvent() } })
    expect(wrapper.find('.event-item').classes()).not.toContain('event-item--tentative')
  })

  it('does not apply tentative class for CONFIRMED events', () => {
    const event = makeEvent({ status: 'CONFIRMED' })
    const wrapper = mount(EventItem, { props: { event } })
    expect(wrapper.find('.event-item').classes()).not.toContain('event-item--tentative')
  })
})
