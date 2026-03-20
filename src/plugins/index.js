/**
 * Plugin Registry
 *
 * Central registry for all calendar source plugins.
 * Each plugin must conform to the CalendarPlugin interface:
 *
 *   {
 *     id: string                    — unique identifier
 *     name: string                  — human-readable name
 *     description: string           — short description
 *     icon: string                  — emoji or symbol
 *     configFields: Array<{         — fields shown in configuration UI
 *       key: string,
 *       label: string,
 *       type: 'text' | 'url' | 'password',
 *       required: boolean,
 *       placeholder?: string
 *     }>
 *     validateConfig(config): { valid: boolean, errors: string[] }
 *     fetchEvents(config, { start: Date, end: Date }): Promise<Event[]>
 *   }
 *
 * An Event object has the shape:
 *   {
 *     id: string
 *     title: string
 *     start: Date
 *     end: Date
 *     allDay: boolean
 *     description?: string
 *     location?: string
 *     status: 'TENTATIVE' | 'CONFIRMED' | ''   — always present; '' means no STATUS in source
 *     source: string    — plugin id
 *   }
 */

import ProtonCalendarPlugin from './ProtonCalendarPlugin.js'
import OutlookPlugin from './OutlookPlugin.js'
import FacebookEventsPlugin from './FacebookEventsPlugin.js'

/**
 * @typedef {Object} CalendarPlugin
 * @property {string} id - Unique identifier
 * @property {string} name - Human-readable name
 * @property {string} description - Short description
 * @property {string} icon - Emoji or symbol
 * @property {Array<{key: string, label: string, type: string, required: boolean, placeholder?: string}>} configFields
 * @property {function(object): {valid: boolean, errors: string[]}} validateConfig
 * @property {function(object, {start: Date, end: Date}): Promise<object[]>} fetchEvents
 */

/** @type {Map<string, CalendarPlugin>} */
const registry = new Map()

/**
 * Register a plugin in the registry.
 * @param {object} plugin - Plugin conforming to the CalendarPlugin interface
 */
export function registerPlugin(plugin) {
  if (!plugin || !plugin.id) {
    throw new Error('Plugin must have an id.')
  }
  registry.set(plugin.id, plugin)
}

/**
 * Get a plugin by its id.
 * @param {string} id
 * @returns {object|undefined}
 */
export function getPlugin(id) {
  return registry.get(id)
}

/**
 * Get all registered plugins as an array.
 * @returns {object[]}
 */
export function getAllPlugins() {
  return Array.from(registry.values())
}

// Register the built-in plugins
registerPlugin(ProtonCalendarPlugin)
registerPlugin(OutlookPlugin)
registerPlugin(FacebookEventsPlugin)
