import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import EventModal from '../components/EventModal.vue'

function makeEvent(overrides = {}) {
  return {
    id: 'e1',
    title: 'Test Event',
    start: '2024-06-15T10:00:00Z',
    end: '2024-06-15T11:30:00Z',
    allDay: false,
    status: '',
    ...overrides,
  }
}

// EventModal uses <teleport to="body">, so its rendered content lives in
// document.body rather than inside the wrapper itself.  These helpers find
// elements in the teleport target.
function bodyFind(selector) {
  return document.body.querySelector(selector)
}

describe('EventModal', () => {
  let wrapper

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
  })

  it('shows the event title', () => {
    wrapper = mount(EventModal, {
      props: { event: makeEvent(), timezone: 'UTC' },
      attachTo: document.body,
    })
    expect(bodyFind('.modal-title').textContent.trim()).toBe('Test Event')
  })

  it('does not show tentative badge for CONFIRMED events', () => {
    wrapper = mount(EventModal, {
      props: { event: makeEvent({ status: 'CONFIRMED' }), timezone: 'UTC' },
      attachTo: document.body,
    })
    expect(bodyFind('.modal-badge')).toBeNull()
  })

  it('does not show tentative badge when status is absent', () => {
    wrapper = mount(EventModal, {
      props: { event: makeEvent({ status: '' }), timezone: 'UTC' },
      attachTo: document.body,
    })
    expect(bodyFind('.modal-badge')).toBeNull()
  })

  it('shows tentative badge for TENTATIVE events', () => {
    wrapper = mount(EventModal, {
      props: { event: makeEvent({ status: 'TENTATIVE' }), timezone: 'UTC' },
      attachTo: document.body,
    })
    const badge = bodyFind('.modal-badge')
    expect(badge).not.toBeNull()
    expect(badge.textContent.trim()).toBe('Tentative')
  })

  it('applies tentative class to modal title for TENTATIVE events', () => {
    wrapper = mount(EventModal, {
      props: { event: makeEvent({ status: 'TENTATIVE' }), timezone: 'UTC' },
      attachTo: document.body,
    })
    expect(bodyFind('.modal-title').classList.contains('modal-title--tentative')).toBe(true)
  })

  it('does not apply tentative class to modal title for non-tentative events', () => {
    wrapper = mount(EventModal, {
      props: { event: makeEvent() },
      attachTo: document.body,
    })
    expect(bodyFind('.modal-title').classList.contains('modal-title--tentative')).toBe(false)
  })

  it('shows the source label when provided', () => {
    wrapper = mount(EventModal, {
      props: { event: makeEvent(), timezone: 'UTC', sourceLabel: 'My Calendar' },
      attachTo: document.body,
    })
    expect(document.body.textContent).toContain('My Calendar')
  })

  it('emits close when the close button is clicked', async () => {
    wrapper = mount(EventModal, {
      props: { event: makeEvent(), timezone: 'UTC' },
      attachTo: document.body,
    })
    await bodyFind('.modal-close').click()
    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})
