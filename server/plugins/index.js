/**
 * Server-side plugin registry.
 *
 * Each plugin defines how to fetch events for a given source type.
 * All current plugins use ICS URLs, so they share the same fetch logic.
 */

import { lookup } from 'node:dns/promises'
import { parseICSData, expandEvents } from '../icsParser.js'

/**
 * Checks whether an IP address belongs to a private, loopback, link-local, or
 * otherwise reserved range (including cloud-metadata addresses like 169.254.169.254).
 * Handles both IPv4 and common private IPv6 ranges.
 * @param {string} ip
 * @returns {boolean}
 */
function isPrivateIP(ip) {
  // --- IPv4 ---
  const parts = ip.split('.').map(Number)
  if (parts.length === 4 && parts.every((p) => !isNaN(p) && p >= 0 && p <= 255)) {
    const [a, b] = parts
    if (a === 0) return true                          // 0.0.0.0/8
    if (a === 10) return true                         // 10.0.0.0/8
    if (a === 100 && b >= 64 && b <= 127) return true // 100.64.0.0/10 shared address space
    if (a === 127) return true                        // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true           // 169.254.0.0/16 link-local / metadata
    if (a === 172 && b >= 16 && b <= 31) return true  // 172.16.0.0/12
    if (a === 192 && b === 168) return true           // 192.168.0.0/16
    if (a === 198 && (b === 18 || b === 19)) return true // 198.18.0.0/16 and 198.19.0.0/16 (benchmarking)
    if (a === 255) return true                        // broadcast
    return false
  }

  // --- IPv6 ---
  const lower = ip.toLowerCase()
  if (lower === '::1') return true                    // loopback
  if (lower === '::') return true                     // unspecified
  // IPv4-mapped: ::ffff:X.X.X.X — check the embedded IPv4 part
  const mappedMatch = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mappedMatch) return isPrivateIP(mappedMatch[1])
  // Unique local: fc00::/7  (fc00:: – fdff::)
  if (/^f[cd]/i.test(lower)) return true
  // Link-local: fe80::/10  (fe80:: – febf::)
  if (/^fe[89ab]/i.test(lower)) return true

  return false
}

/**
 * Validates that a URL is safe to fetch server-side (prevents SSRF).
 * Only HTTP/HTTPS are allowed and private/loopback/link-local IP ranges
 * (including cloud-metadata addresses) are blocked.
 * @param {string} url - The URL to validate (after webcal normalisation)
 * @throws {Error} if the URL is unsafe
 */
async function validateFetchUrl(url) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('Invalid URL.')
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only HTTP and HTTPS URLs are allowed.')
  }

  // Block bare hostnames that resolve to loopback without needing DNS
  if (parsed.hostname === 'localhost') {
    throw new Error('Requests to private, loopback, or link-local addresses are not allowed.')
  }

  let address
  try {
    const result = await lookup(parsed.hostname)
    address = result.address
  } catch {
    throw new Error(`Cannot resolve hostname: ${parsed.hostname}`)
  }

  if (isPrivateIP(address)) {
    throw new Error('Requests to private, loopback, or link-local addresses are not allowed.')
  }
}

/**
 * Generic ICS fetcher – used by Proton Calendar, Outlook, and Facebook Events.
 * Normalises webcal:// to https:// before fetching and validates the URL
 * against SSRF attack vectors.
 * @param {object} config - Source configuration (must include `icsUrl`)
 * @param {{ start: Date, end: Date }} dateRange
 * @param {string} sourceId
 * @returns {Promise<object[]>} Filtered events within the date range
 */
async function fetchICSEvents(config, dateRange, sourceId) {
  const { start, end } = dateRange
  const fetchUrl = config.icsUrl.replace(/^webcal:/i, 'https:')
  await validateFetchUrl(fetchUrl)
  const response = await fetch(fetchUrl)
  if (!response.ok) {
    throw new Error(`Failed to fetch calendar (HTTP ${response.status})`)
  }
  const icsText = await response.text()
  const rawEvents = parseICSData(icsText, sourceId)
  const events = expandEvents(rawEvents, start, end)
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
registerPlugin({ id: 'proton-calendar', fetchEvents: fetchICSEvents })
registerPlugin({ id: 'outlook', fetchEvents: fetchICSEvents })
registerPlugin({ id: 'facebook-events', fetchEvents: fetchICSEvents })

