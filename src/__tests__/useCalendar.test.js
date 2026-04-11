import { describe, it, expect, beforeEach, vi } from 'vitest'

// In-memory store simulating the server API
let serverSources = []

function makeFetchMock() {
  return vi.fn(async (url, options = {}) => {
    const method = (options.method || 'GET').toUpperCase()

    // POST /api/sources/:id/refresh  OR  POST /api/sources (add)
    if (method === 'POST') {
      // /api/sources/:id/refresh
      const refreshMatch = url.match(/\/api\/sources\/([^?/]+)\/refresh$/)
      if (refreshMatch) {
        const id = refreshMatch[1]
        const source = serverSources.find((s) => s.id === id)
        if (!source) return { ok: false, status: 404, json: async () => ({ error: 'Not found' }) }
        if (!source.enabled) return { ok: false, status: 400, json: async () => ({ error: 'Source is disabled.' }) }
        return { ok: true, status: 200, json: async () => ({ ok: true }) }
      }
      // POST /api/sources
      if (url.endsWith('/api/sources')) {
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
    }

    // GET /api/sources
    if (method === 'GET' && url.endsWith('/api/sources')) {
      return { ok: true, status: 200, json: async () => [...serverSources] }
    }

    // PATCH /api/sources/:id  or  DELETE /api/sources/:id
    const sourceIdMatch = url.match(/\/api\/sources\/([^?]+)$/)
    if (method === 'PATCH' && sourceIdMatch) {
      const id = sourceIdMatch[1]
      const idx = serverSources.findIndex((s) => s.id === id)
      if (idx === -1) return { ok: false, status: 404, json: async () => ({ error: 'Not found' }) }
      const updates = JSON.parse(options.body)
      serverSources[idx] = { ...serverSources[idx], ...updates }
      return { ok: true, status: 200, json: async () => serverSources[idx] }
    }

    // DELETE /api/sources/:id
    if (method === 'DELETE' && sourceIdMatch) {
      const id = sourceIdMatch[1]
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

  it('refreshSource posts to the refresh endpoint successfully', async () => {
    const { sources, error, addSource, refreshSource } = useCalendar()
    error.value = null
    await addSource({ pluginId: 'outlook', config: { icsUrl: 'https://example.com/cal.ics' } })
    const id = sources.value[sources.value.length - 1].id
    await expect(refreshSource(id)).resolves.toBeUndefined()
    expect(error.value).toBeNull()
    expect(globalThis.fetch).toHaveBeenCalledWith(
      `/api/sources/${id}/refresh`,
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('refreshSource sets error and rethrows on non-2xx response', async () => {
    const { error, refreshSource } = useCalendar()
    error.value = null
    // Provide a source id that the mock will return 404 for
    await expect(refreshSource('nonexistent-id')).rejects.toThrow()
    expect(error.value).not.toBeNull()
  })

  it('refreshSource sets error and rethrows when source is disabled', async () => {
    const { sources, error, addSource, toggleSource, refreshSource } = useCalendar()
    error.value = null
    await addSource({ pluginId: 'outlook', config: { icsUrl: 'https://example.com/cal.ics' } })
    const id = sources.value[sources.value.length - 1].id
    await toggleSource(id) // disable it
    await expect(refreshSource(id)).rejects.toThrow()
    expect(error.value).not.toBeNull()
  })
})

