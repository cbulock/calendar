/**
 * Server-side plugin registry.
 *
 * Each plugin defines how to fetch events for a given source type.
 * All current plugins use ICS URLs, so they share the same fetch logic.
 */

import { parseICSData } from '../icsParser.js'

/**
 * Generic ICS fetcher – used by Proton Calendar, Outlook, and Facebook Events.
 * Normalises webcal:// to https:// before fetching.
 * @param {object} config - Source configuration (must include `icsUrl`)
 * @param {{ start: Date, end: Date }} dateRange
 * @returns {Promise<object[]>} Filtered events within the date range
 */
async function fetchICSEvents(config, dateRange, sourceId) {
  const { start, end } = dateRange
  const fetchUrl = config.icsUrl.replace(/^webcal:/i, 'https:')
  const response = await fetch(fetchUrl)
  if (!response.ok) {
    throw new Error(`Failed to fetch calendar (HTTP ${response.status})`)
  }
  const icsText = await response.text()
  const events = parseICSData(icsText, sourceId)
  return events.filter((e) => e.end >= start && e.start <= end)
}

/** @type {Map<string, { fetchEvents: Function }>} */
const registry = new Map()

/**
 * Register a server-side plugin.
 * @param {{ id: string, fetchEvents: Function }} plugin
 */
export function registerPlugin(plugin) {
  if (!plugin || !plugin.id) {
    throw new Error('Plugin must have an id.')
  }
  registry.set(plugin.id, plugin)
}

/**
 * Get a plugin by id.
 * @param {string} id
 * @returns {{ id: string, fetchEvents: Function } | undefined}
 */
export function getPlugin(id) {
  return registry.get(id)
}

// Register built-in plugins
registerPlugin({
  id: 'proton-calendar',
  fetchEvents: (config, dateRange, sourceId) => fetchICSEvents(config, dateRange, sourceId),
})

registerPlugin({
  id: 'outlook',
  fetchEvents: (config, dateRange, sourceId) => fetchICSEvents(config, dateRange, sourceId),
})

registerPlugin({
  id: 'facebook-events',
  fetchEvents: (config, dateRange, sourceId) => fetchICSEvents(config, dateRange, sourceId),
})
