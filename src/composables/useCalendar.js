/**
 * useCalendar composable
 *
 * Manages the list of configured calendar sources and fetching/merging events
 * from all enabled plugins.
 */

import { ref, computed } from 'vue'
import { getPlugin } from '../plugins/index.js'

// Persist configured sources in localStorage
const STORAGE_KEY = 'calendar_sources'

function loadSources() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveSources(sources) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sources))
}

/** @type {import('vue').Ref<Array>} */
const sources = ref(loadSources())

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
 * Add a new calendar source.
 * @param {{ pluginId: string, config: object, label?: string }} source
 */
function addSource(source) {
  const newSource = {
    id: `${source.pluginId}-${Date.now()}`,
    pluginId: source.pluginId,
    label: source.label || source.config.calendarName || source.pluginId,
    config: source.config,
    enabled: true,
  }
  sources.value.push(newSource)
  saveSources(sources.value)
}

/**
 * Remove a calendar source by its id.
 * @param {string} sourceId
 */
function removeSource(sourceId) {
  sources.value = sources.value.filter((s) => s.id !== sourceId)
  saveSources(sources.value)
}

/**
 * Toggle a source's enabled state.
 * @param {string} sourceId
 */
function toggleSource(sourceId) {
  const source = sources.value.find((s) => s.id === sourceId)
  if (source) {
    source.enabled = !source.enabled
    saveSources(sources.value)
  }
}

/**
 * Update an existing source's config.
 * @param {string} sourceId
 * @param {object} updates - Partial updates to apply (config, label, etc.)
 */
function updateSource(sourceId, updates) {
  const idx = sources.value.findIndex((s) => s.id === sourceId)
  if (idx !== -1) {
    sources.value[idx] = { ...sources.value[idx], ...updates }
    saveSources(sources.value)
  }
}

/**
 * Fetch events from all enabled sources within the given date range.
 * @param {Date} start
 * @param {Date} end
 */
async function fetchEvents(start, end) {
  loading.value = true
  error.value = null
  const dateRange = { start, end }
  const results = []
  const errors = []

  await Promise.allSettled(
    enabledSources.value.map(async (source) => {
      const plugin = getPlugin(source.pluginId)
      if (!plugin) return
      try {
        const evts = await plugin.fetchEvents(source.config, dateRange)
        results.push(...evts)
      } catch (err) {
        errors.push(`${source.label}: ${err.message}`)
      }
    }),
  )

  events.value = results.sort((a, b) => a.start - b.start)
  loading.value = false
  if (errors.length > 0) {
    error.value = errors.join('\n')
  }
}

export function useCalendar() {
  return {
    sources,
    events,
    loading,
    error,
    enabledSources,
    addSource,
    removeSource,
    toggleSource,
    updateSource,
    fetchEvents,
  }
}
