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

import dayjs from 'dayjs'
import { loadSources } from './storage.js'
import { getPlugin } from './plugins/index.js'
import { deduplicateEvents } from './icsParser.js'

/** How far back (in days) to pre-fetch events. */
const PREFETCH_PAST_DAYS = 90

/** How far forward (in days) to pre-fetch events. */
const PREFETCH_FUTURE_DAYS = 365

/** Background refresh interval in ms (default 15 min). */
const REFRESH_INTERVAL_MS =
  Number(process.env.REFRESH_INTERVAL_MS) || 15 * 60 * 1000

/**
 * Cached event data.
 *
 * Errors are stored as structured objects `{ sourceId, message }` so that
 * refreshSource() can reliably clear errors by sourceId regardless of whether
 * the source label has been renamed since the error was recorded.
 *
 * @type {{ events: object[], errors: Array<{sourceId:string, message:string}>, lastRefreshed: Date|null }}
 */
let _cache = {
  events: [],
  errors: [],
  lastRefreshed: null,
}

/** Reference to the active interval so it can be cleared in tests. */
let _intervalHandle = null

/** True while a refresh is already in progress; prevents overlapping runs for both refresh() and refreshSource(). */
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
    const now = dayjs()
    const start = now.subtract(PREFETCH_PAST_DAYS, 'day').toDate()
    const end = now.add(PREFETCH_FUTURE_DAYS, 'day').toDate()

    const sources = loadSources().filter((s) => s.enabled !== false)
    const dateRange = { start, end }
    const events = []
    const errors = []

    await Promise.allSettled(
      sources.map(async (source) => {
        const plugin = getPlugin(source.pluginId)
        if (!plugin) {
          errors.push({ sourceId: source.id, message: `${source.label}: Unknown plugin "${source.pluginId}"` })
          return
        }
        try {
          const evts = await plugin.fetchEvents(source.config, dateRange, source.id)
          events.push(...evts)
        } catch (err) {
          errors.push({ sourceId: source.id, message: `${source.label}: ${err.message}` })
        }
      }),
    )

    events.sort((a, b) => dayjs(a.start).valueOf() - dayjs(b.start).valueOf())
    const dedupedEvents = deduplicateEvents(events)

    _cache = { events: dedupedEvents, errors, lastRefreshed: new Date() }

    if (errors.length > 0) {
      console.warn(`[scheduler] Refresh completed with ${errors.length} error(s):`, errors)
    } else {
      console.log(`[scheduler] Refreshed ${dedupedEvents.length} event(s) (${events.length - dedupedEvents.length} duplicate(s) removed) from ${sources.length} source(s) at ${_cache.lastRefreshed.toISOString()}`)
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
      ? dayjs(_cache.lastRefreshed).add(REFRESH_INTERVAL_MS, 'millisecond').toISOString()
      : null,
    sourceCount: sources.filter((s) => s.enabled !== false).length,
    errorCount: _cache.errors.length,
  }
}

/**
 * Return cached events optionally filtered to a date window.
 * Errors are serialized to strings for API consumers.
 * @param {Date} [start] - Inclusive lower bound (omit for all events)
 * @param {Date} [end]   - Inclusive upper bound (omit for all events)
 * @returns {{ events: object[], errors: string[], lastRefreshed: Date|null }}
 */
export function getCachedEvents(start, end) {
  const serialized = {
    ..._cache,
    errors: _cache.errors.map((e) => e.message),
  }
  if (!start || !end) return serialized
  const startMs = dayjs(start).valueOf()
  const endMs = dayjs(end).valueOf()
  return {
    ...serialized,
    events: _cache.events.filter((e) => dayjs(e.end).valueOf() >= startMs && dayjs(e.start).valueOf() <= endMs),
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

/**
 * Refresh events for a single calendar source and merge them into the cache.
 * Events previously fetched from this source are replaced.
 *
 * Participates in the same `_refreshing` guard as refresh() so that a
 * full-refresh and a single-source refresh never race and corrupt the cache.
 * Like refresh(), this is a no-op if a refresh is already in progress.
 *
 * @param {string} sourceId - The id of the source to refresh.
 * @returns {Promise<void>}
 */
export async function refreshSource(sourceId) {
  if (_refreshing) return
  _refreshing = true
  try {
    const sources = loadSources()
    const source = sources.find((s) => s.id === sourceId)
    if (!source) {
      throw new Error(`Source not found: ${sourceId}`)
    }
    if (source.enabled === false) {
      throw new Error(`Source is disabled: ${sourceId}`)
    }

    const plugin = getPlugin(source.pluginId)
    if (!plugin) {
      throw new Error(`Unknown plugin "${source.pluginId}" for source ${sourceId}`)
    }

    const now = dayjs()
    const start = now.subtract(PREFETCH_PAST_DAYS, 'day').toDate()
    const end = now.add(PREFETCH_FUTURE_DAYS, 'day').toDate()
    const dateRange = { start, end }

    const newEvents = await plugin.fetchEvents(source.config, dateRange, source.id)

    // Replace cached events for this source with the freshly fetched ones
    const retained = _cache.events.filter((e) => e.source !== sourceId)
    const merged = [...retained, ...newEvents]
    merged.sort((a, b) => dayjs(a.start).valueOf() - dayjs(b.start).valueOf())
    const dedupedEvents = deduplicateEvents(merged)

    // Clear any prior error for this source by sourceId (not label, which is user-editable)
    const retainedErrors = _cache.errors.filter((e) => e.sourceId !== sourceId)

    _cache = { events: dedupedEvents, errors: retainedErrors, lastRefreshed: new Date() }
    console.log(`[scheduler] Refreshed source "${source.label}" — ${newEvents.length} event(s)`)
  } finally {
    _refreshing = false
  }
}
