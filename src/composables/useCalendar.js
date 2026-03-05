/**
 * useCalendar composable
 *
 * Manages the list of configured calendar sources and fetching/merging events
 * from all enabled plugins via the server-side API.
 */

import { ref, computed } from 'vue'

const API_BASE = '/api'

/** @type {import('vue').Ref<Array>} */
const sources = ref([])

/** @type {import('vue').Ref<Array>} */
const events = ref([])

/** @type {import('vue').Ref<boolean>} */
const loading = ref(false)

/** @type {import('vue').Ref<string|null>} */
const error = ref(null)

/**
 * Enabled sources (those with enabled !== false).
 */
const enabledSources = computed(() => sources.value.filter((s) => s.enabled !== false))

/**
 * Load all sources from the server.
 */
async function loadSources() {
  try {
    const res = await fetch(`${API_BASE}/sources`)
    if (!res.ok) throw new Error(`Server error: ${res.status}`)
    sources.value = await res.json()
  } catch (err) {
    error.value = `Failed to load sources: ${err.message}`
  }
}

/**
 * Add a new calendar source.
 * @param {{ pluginId: string, config: object, label?: string }} source
 */
async function addSource(source) {
  const res = await fetch(`${API_BASE}/sources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(source),
  })
  if (!res.ok) {
    const { error: msg } = await res.json().catch(() => ({}))
    throw new Error(msg || `Server error: ${res.status}`)
  }
  const newSource = await res.json()
  sources.value.push(newSource)
}

/**
 * Remove a calendar source by its id.
 * @param {string} sourceId
 */
async function removeSource(sourceId) {
  const res = await fetch(`${API_BASE}/sources/${sourceId}`, { method: 'DELETE' })
  if (!res.ok && res.status !== 404) {
    throw new Error(`Server error: ${res.status}`)
  }
  sources.value = sources.value.filter((s) => s.id !== sourceId)
}

/**
 * Toggle a source's enabled state.
 * @param {string} sourceId
 */
async function toggleSource(sourceId) {
  const source = sources.value.find((s) => s.id === sourceId)
  if (!source) return
  const enabled = !source.enabled
  error.value = null
  try {
    const res = await fetch(`${API_BASE}/sources/${sourceId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    })
    if (!res.ok) throw new Error(`Server error: ${res.status}`)
    source.enabled = enabled
  } catch (err) {
    error.value = `Failed to toggle source: ${err.message}`
  }
}

/**
 * Update an existing source's config.
 * @param {string} sourceId
 * @param {object} updates - Partial updates to apply (config, label, etc.)
 */
async function updateSource(sourceId, updates) {
  const res = await fetch(`${API_BASE}/sources/${sourceId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })
  if (!res.ok) throw new Error(`Server error: ${res.status}`)
  const updated = await res.json()
  const idx = sources.value.findIndex((s) => s.id === sourceId)
  if (idx !== -1) sources.value[idx] = updated
}

/**
 * Fetch events from all enabled sources within the given date range.
 * @param {Date} start
 * @param {Date} end
 */
async function fetchEvents(start, end) {
  loading.value = true
  error.value = null
  try {
    const params = new URLSearchParams({
      start: start.toISOString(),
      end: end.toISOString(),
    })
    const res = await fetch(`${API_BASE}/events?${params}`)
    if (!res.ok) throw new Error(`Server error: ${res.status}`)
    const { events: evts = [], errors = [] } = await res.json()
    events.value = evts.map((e) => ({ ...e, start: new Date(e.start), end: new Date(e.end) }))
    if (errors && errors.length > 0) {
      error.value = errors.join('\n')
    }
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

export function useCalendar() {
  return {
    sources,
    events,
    loading,
    error,
    enabledSources,
    loadSources,
    addSource,
    removeSource,
    toggleSource,
    updateSource,
    fetchEvents,
  }
}

