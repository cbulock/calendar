/**
 * Event scheduler — periodically fetches events from all enabled calendar
 * sources and keeps them in an in-memory cache so that API responses are
 * instantaneous (no live ICS fetch per request).
 *
 * The scheduler fetches a rolling window of PREFETCH_PAST_DAYS days before
 * today through PREFETCH_FUTURE_DAYS days after today. The GET /api/events
 * handler then slices from that cache using the caller-supplied date range.
 *
 * REFRESH_INTERVAL_MS controls how often a background refresh runs
 * (default 15 minutes, overridable via REFRESH_INTERVAL_MS env var).
 */

import { loadSources } from './storage.js'
import { getPlugin } from './plugins/index.js'

/** How far back (in days) to pre-fetch events. */
const PREFETCH_PAST_DAYS = 90

/** How far forward (in days) to pre-fetch events. */
const PREFETCH_FUTURE_DAYS = 365

/** Background refresh interval in ms (default 15 min). */
const REFRESH_INTERVAL_MS =
  Number(process.env.REFRESH_INTERVAL_MS) || 15 * 60 * 1000

/**
 * Cached event data.
 * @type {{ events: object[], errors: string[], lastRefreshed: Date|null }}
 */
let _cache = {
  events: [],
  errors: [],
  lastRefreshed: null,
}

/** Reference to the active interval so it can be cleared in tests. */
let _intervalHandle = null

/** True while a refresh is already in progress; prevents overlapping runs. */
let _refreshing = false

/**
 * Fetch events for all enabled sources across a broad date window and store
 * the results in _cache.  Errors from individual sources are collected rather
 * than surfaced as exceptions so a single bad source never blocks the rest.
 *
 * If a refresh is already running this call is a no-op to prevent concurrent
 * overlapping fetches from consuming resources unnecessarily.
 */
export async function refresh() {
  if (_refreshing) return
  _refreshing = true
  try {
    const now = new Date()
    const start = new Date(now)
    start.setDate(start.getDate() - PREFETCH_PAST_DAYS)
    const end = new Date(now)
    end.setDate(end.getDate() + PREFETCH_FUTURE_DAYS)

    const sources = loadSources().filter((s) => s.enabled !== false)
    const dateRange = { start, end }
    const events = []
    const errors = []

    await Promise.allSettled(
      sources.map(async (source) => {
        const plugin = getPlugin(source.pluginId)
        if (!plugin) {
          errors.push(`${source.label}: Unknown plugin "${source.pluginId}"`)
          return
        }
        try {
          const evts = await plugin.fetchEvents(source.config, dateRange, source.id)
          events.push(...evts)
        } catch (err) {
          errors.push(`${source.label}: ${err.message}`)
        }
      }),
    )

    events.sort((a, b) => new Date(a.start) - new Date(b.start))

    _cache = { events, errors, lastRefreshed: new Date() }

    if (errors.length > 0) {
      console.warn(`[scheduler] Refresh completed with ${errors.length} error(s):`, errors)
    } else {
      console.log(`[scheduler] Refreshed ${events.length} event(s) from ${sources.length} source(s) at ${_cache.lastRefreshed.toISOString()}`)
    }
  } finally {
    _refreshing = false
  }
}

/**
 * Return a status summary for the scheduler.
 * @returns {{ lastRefreshed: string|null, nextRefreshAt: string|null, sourceCount: number, errorCount: number }}
 */
export function getStatus() {
  const sources = loadSources()
  return {
    lastRefreshed: _cache.lastRefreshed ? _cache.lastRefreshed.toISOString() : null,
    nextRefreshAt: _intervalHandle && _cache.lastRefreshed
      ? new Date(_cache.lastRefreshed.getTime() + REFRESH_INTERVAL_MS).toISOString()
      : null,
    sourceCount: sources.filter((s) => s.enabled !== false).length,
    errorCount: _cache.errors.length,
  }
}

/**
 * Return cached events optionally filtered to a date window.
 * @param {Date} [start] - Inclusive lower bound (omit for all events)
 * @param {Date} [end]   - Inclusive upper bound (omit for all events)
 * @returns {{ events: object[], errors: string[], lastRefreshed: Date|null }}
 */
export function getCachedEvents(start, end) {
  if (!start || !end) return { ..._cache }
  return {
    ..._cache,
    events: _cache.events.filter((e) => new Date(e.end) >= start && new Date(e.start) <= end),
  }
}

/**
 * Start the background refresh scheduler.
 * Performs an initial refresh immediately, then repeats every
 * REFRESH_INTERVAL_MS milliseconds.
 */
export function startScheduler() {
  // Initial refresh (non-blocking — errors are logged, not thrown)
  refresh().catch((err) => console.error('[scheduler] Initial refresh failed:', err))

  // Periodic refresh
  _intervalHandle = setInterval(() => {
    refresh().catch((err) => console.error('[scheduler] Scheduled refresh failed:', err))
  }, REFRESH_INTERVAL_MS)

  // Don't let the interval keep the process alive if nothing else is running
  if (_intervalHandle.unref) _intervalHandle.unref()

  console.log(`[scheduler] Started — refresh interval ${REFRESH_INTERVAL_MS / 1000}s`)
}

/**
 * Stop the background scheduler (mainly useful in tests).
 */
export function stopScheduler() {
  if (_intervalHandle) {
    clearInterval(_intervalHandle)
    _intervalHandle = null
  }
}
