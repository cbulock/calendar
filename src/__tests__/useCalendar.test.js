import { describe, it, expect, beforeEach, vi } from 'vitest'

// In-memory store simulating the server API
let serverSources = []

function makeFetchMock() {
  return vi.fn(async (url, options = {}) => {
    const method = (options.method || 'GET').toUpperCase()

    // POST /api/sources
    if (method === 'POST' && url.endsWith('/api/sources')) {
      const body = JSON.parse(options.body)
      const newSource = {
        id: `${body.pluginId}-${Date.now()}`,
        pluginId: body.pluginId,
        label: body.label || body.config?.calendarName || body.pluginId,
        config: body.config,
        enabled: true,
      }
      serverSources.push(newSource)
      return { ok: true, status: 201, json: async () => newSource }
    }

    // GET /api/sources
    if (method === 'GET' && url.endsWith('/api/sources')) {
      return { ok: true, status: 200, json: async () => [...serverSources] }
    }

    // PATCH /api/sources/:id
    const patchMatch = url.match(/\/api\/sources\/([^?]+)$/)
    if (method === 'PATCH' && patchMatch) {
      const id = patchMatch[1]
      const idx = serverSources.findIndex((s) => s.id === id)
      if (idx === -1) return { ok: false, status: 404, json: async () => ({ error: 'Not found' }) }
      const updates = JSON.parse(options.body)
      serverSources[idx] = { ...serverSources[idx], ...updates }
      return { ok: true, status: 200, json: async () => serverSources[idx] }
    }

    // DELETE /api/sources/:id
    const deleteMatch = url.match(/\/api\/sources\/([^?]+)$/)
    if (method === 'DELETE' && deleteMatch) {
      const id = deleteMatch[1]
      serverSources = serverSources.filter((s) => s.id !== id)
      return { ok: true, status: 204, json: async () => ({}) }
    }

    return { ok: false, status: 404, json: async () => ({ error: 'Not found' }) }
  })
}

// Import after mocks are set up
const { useCalendar } = await import('../composables/useCalendar.js')

describe('useCalendar composable', () => {
  beforeEach(() => {
    serverSources = []
    // Reset shared module-level state between tests
    const { sources, events } = useCalendar()
    sources.value = []
    events.value = []
    globalThis.fetch = makeFetchMock()
  })

  it('starts with empty sources', () => {
    const { sources } = useCalendar()
    expect(sources.value).toHaveLength(0)
  })

  it('loadSources fetches sources from the API', async () => {
    serverSources = [
      { id: 'outlook-1', pluginId: 'outlook', label: 'Work', config: {}, enabled: true },
    ]
    const { sources, loadSources } = useCalendar()
    await loadSources()
    expect(sources.value).toHaveLength(1)
    expect(sources.value[0].pluginId).toBe('outlook')
  })

  it('addSource adds a new source via the API', async () => {
    const { sources, addSource } = useCalendar()
    await addSource({
      pluginId: 'outlook',
      config: { icsUrl: 'https://example.com/cal.ics', calendarName: 'Work' },
      label: 'Work',
    })
    expect(sources.value.length).toBeGreaterThan(0)
    expect(sources.value[0].pluginId).toBe('outlook')
    expect(sources.value[0].enabled).toBe(true)
  })

  it('removeSource removes the source by id', async () => {
    const { sources, addSource, removeSource } = useCalendar()
    await addSource({ pluginId: 'outlook', config: { icsUrl: 'https://example.com/cal.ics' } })
    const id = sources.value[sources.value.length - 1].id
    await removeSource(id)
    expect(sources.value.find((s) => s.id === id)).toBeUndefined()
  })

  it('toggleSource flips enabled state', async () => {
    const { sources, addSource, toggleSource } = useCalendar()
    await addSource({ pluginId: 'outlook', config: { icsUrl: 'https://example.com/cal.ics' } })
    const id = sources.value[sources.value.length - 1].id
    expect(sources.value.find((s) => s.id === id).enabled).toBe(true)
    await toggleSource(id)
    expect(sources.value.find((s) => s.id === id).enabled).toBe(false)
    await toggleSource(id)
    expect(sources.value.find((s) => s.id === id).enabled).toBe(true)
  })

  it('enabledSources only returns enabled sources', async () => {
    const { sources, addSource, toggleSource, enabledSources } = useCalendar()
    const beforeLen = sources.value.length
    await addSource({ pluginId: 'outlook', config: { icsUrl: 'https://a.com/a.ics' } })
    const firstId = sources.value[beforeLen].id
    await addSource({ pluginId: 'proton-calendar', config: { icsUrl: 'https://b.com/b.ics' } })
    const secondId = sources.value[beforeLen + 1].id
    await toggleSource(firstId)
    expect(enabledSources.value.some((s) => s.id === firstId)).toBe(false)
    expect(enabledSources.value.some((s) => s.id === secondId)).toBe(true)
  })

  it('updateSource updates the source via the API', async () => {
    const { sources, addSource, updateSource } = useCalendar()
    await addSource({ pluginId: 'outlook', config: { icsUrl: 'https://example.com/cal.ics' } })
    const id = sources.value[sources.value.length - 1].id
    await updateSource(id, { label: 'Updated Label' })
    expect(sources.value.find((s) => s.id === id).label).toBe('Updated Label')
  })
})

