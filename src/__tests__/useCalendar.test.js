import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock localStorage
const localStorageMock = (() => {
  let store = {}
  return {
    getItem: (key) => store[key] ?? null,
    setItem: (key, value) => { store[key] = String(value) },
    removeItem: (key) => { delete store[key] },
    clear: () => { store = {} },
  }
})()

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true })

// Import after mock is set up
const { useCalendar } = await import('../composables/useCalendar.js')

describe('useCalendar composable', () => {
  beforeEach(() => {
    localStorageMock.clear()
    // Reset shared module-level state between tests
    const { sources, events } = useCalendar()
    sources.value = []
    events.value = []
  })

  it('starts with empty sources when localStorage is empty', () => {
    const { sources } = useCalendar()
    expect(sources.value).toHaveLength(0)
  })

  it('addSource adds a new source', () => {
    const { sources, addSource } = useCalendar()
    addSource({
      pluginId: 'outlook',
      config: { icsUrl: 'https://example.com/cal.ics', calendarName: 'Work' },
      label: 'Work',
    })
    expect(sources.value.length).toBeGreaterThan(0)
    expect(sources.value[0].pluginId).toBe('outlook')
    expect(sources.value[0].enabled).toBe(true)
  })

  it('removeSource removes the source by id', () => {
    const { sources, addSource, removeSource } = useCalendar()
    addSource({ pluginId: 'outlook', config: { icsUrl: 'https://example.com/cal.ics' } })
    const id = sources.value[sources.value.length - 1].id
    removeSource(id)
    expect(sources.value.find((s) => s.id === id)).toBeUndefined()
  })

  it('toggleSource flips enabled state', () => {
    const { sources, addSource, toggleSource } = useCalendar()
    addSource({ pluginId: 'outlook', config: { icsUrl: 'https://example.com/cal.ics' } })
    const id = sources.value[sources.value.length - 1].id
    expect(sources.value.find((s) => s.id === id).enabled).toBe(true)
    toggleSource(id)
    expect(sources.value.find((s) => s.id === id).enabled).toBe(false)
    toggleSource(id)
    expect(sources.value.find((s) => s.id === id).enabled).toBe(true)
  })

  it('enabledSources only returns enabled sources', () => {
    const { sources, addSource, toggleSource, enabledSources } = useCalendar()
    const beforeLen = sources.value.length
    addSource({ pluginId: 'outlook', config: { icsUrl: 'https://a.com/a.ics' } })
    const firstId = sources.value[beforeLen].id
    addSource({ pluginId: 'proton-calendar', config: { icsUrl: 'https://b.com/b.ics' } })
    const secondId = sources.value[beforeLen + 1].id
    toggleSource(firstId)
    expect(enabledSources.value.some((s) => s.id === firstId)).toBe(false)
    expect(enabledSources.value.some((s) => s.id === secondId)).toBe(true)
  })

  it('updateSource updates the source', () => {
    const { sources, addSource, updateSource } = useCalendar()
    addSource({ pluginId: 'outlook', config: { icsUrl: 'https://example.com/cal.ics' } })
    const id = sources.value[sources.value.length - 1].id
    updateSource(id, { label: 'Updated Label' })
    expect(sources.value.find((s) => s.id === id).label).toBe('Updated Label')
  })
})
