/**
 * Calendar API Server
 *
 * Provides REST endpoints for managing calendar sources and fetching events.
 * Sources are persisted to disk; event data is fetched server-side and kept
 * in an in-memory cache that is refreshed on a schedule (see scheduler.js).
 *
 * Endpoints:
 *   GET    /api/sources            List all sources
 *   POST   /api/sources            Add a new source
 *   PATCH  /api/sources/:id        Update a source (config, label, enabled)
 *   DELETE /api/sources/:id        Remove a source
 *   GET    /api/events             Fetch events from the in-memory cache
 *                                  Query params: start (ISO), end (ISO)
 */

import express from 'express'
import dayjs from 'dayjs'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadSources, saveSources } from './storage.js'
import { startScheduler, getCachedEvents, refresh, refreshSource, getStatus } from './scheduler.js'
import { renderCalendarImage, renderDefaults } from './render.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST_DIR = join(__dirname, '..', 'dist')

function parsePositiveInteger(value, fallback) {
  if (value === undefined) return fallback
  const parsed = Number.parseInt(String(value), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function parseNonNegativeInteger(value, fallback) {
  if (value === undefined) return fallback
  const parsed = Number.parseInt(String(value), 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function createApp() {
  const app = express()
  app.use(express.json())

  /* ------------------------------------------------------------------ */
  /* Sources                                                              */
  /* ------------------------------------------------------------------ */

  /** GET /api/sources */
  app.get('/api/sources', (_req, res) => {
    res.json(loadSources())
  })

  /** POST /api/sources */
  app.post('/api/sources', (req, res) => {
    const { pluginId, config, label } = req.body
    if (!pluginId || !config) {
      return res.status(400).json({ error: 'pluginId and config are required.' })
    }
    const sources = loadSources()
    const newSource = {
      id: `${pluginId}-${Date.now()}`,
      pluginId,
      label: label || config.calendarName || pluginId,
      config,
      enabled: true,
    }
    sources.push(newSource)
    saveSources(sources)
    // Kick off a cache refresh asynchronously. The response is returned before
    // the refresh completes; clients may see stale events for a brief period
    // (eventual consistency). This avoids blocking the HTTP response on
    // potentially slow network ICS fetches.
    refresh().catch((err) => console.error('[scheduler] Post-add refresh failed:', err))
    res.status(201).json(newSource)
  })

  /** PATCH /api/sources/:id */
  app.patch('/api/sources/:id', (req, res) => {
    const sources = loadSources()
    const idx = sources.findIndex((s) => s.id === req.params.id)
    if (idx === -1) {
      return res.status(404).json({ error: 'Source not found.' })
    }
    const updatedSource = { ...sources[idx] }
    if (Object.prototype.hasOwnProperty.call(req.body, 'config')) {
      updatedSource.config = req.body.config
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'label')) {
      updatedSource.label = req.body.label
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'enabled')) {
      updatedSource.enabled = req.body.enabled
    }
    sources[idx] = updatedSource
    saveSources(sources)
    // Kick off a cache refresh asynchronously (eventual consistency — see POST handler).
    refresh().catch((err) => console.error('[scheduler] Post-patch refresh failed:', err))
    res.json(sources[idx])
  })

  /** DELETE /api/sources/:id */
  app.delete('/api/sources/:id', (req, res) => {
    const sources = loadSources()
    const filtered = sources.filter((s) => s.id !== req.params.id)
    if (filtered.length === sources.length) {
      return res.status(404).json({ error: 'Source not found.' })
    }
    saveSources(filtered)
    // Kick off a cache refresh asynchronously (eventual consistency — see POST handler).
    refresh().catch((err) => console.error('[scheduler] Post-delete refresh failed:', err))
    res.status(204).end()
  })

  /** POST /api/sources/:id/refresh — force-refresh a single calendar source */
  app.post('/api/sources/:id/refresh', async (req, res) => {
    const sources = loadSources()
    const source = sources.find((s) => s.id === req.params.id)
    if (!source) {
      return res.status(404).json({ error: 'Source not found.' })
    }
    if (source.enabled === false) {
      return res.status(400).json({ error: 'Source is disabled.' })
    }
    try {
      await refreshSource(req.params.id)
      res.json({ ok: true })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  /* ------------------------------------------------------------------ */
  /* Status                                                               */
  /* ------------------------------------------------------------------ */

  /** GET /api/status */
  app.get('/api/status', (_req, res) => {
    res.json(getStatus())
  })

  /* ------------------------------------------------------------------ */
  /* Events                                                               */
  /* ------------------------------------------------------------------ */

  /** GET /api/events?start=ISO&end=ISO */
  app.get('/api/events', (req, res) => {
    const { start, end } = req.query
    if (!start || !end) {
      return res.status(400).json({ error: 'start and end query parameters are required.' })
    }

    const startDate = dayjs(start)
    const endDate = dayjs(end)
    if (!startDate.isValid() || !endDate.isValid()) {
      return res.status(400).json({ error: 'start and end must be valid ISO date strings.' })
    }

    const { events, errors, lastRefreshed } = getCachedEvents(startDate.toDate(), endDate.toDate())
    res.json({ events, errors, lastRefreshed })
  })

  /* ------------------------------------------------------------------ */
  /* Rendering                                                            */
  /* ------------------------------------------------------------------ */

  /** GET /api/render/day.png */
  app.get('/api/render/day.png', async (req, res) => {
    const width = parsePositiveInteger(req.query.width, renderDefaults.width)
    const height = parsePositiveInteger(req.query.height, renderDefaults.height)
    const timeoutMs = parsePositiveInteger(req.query.timeoutMs, renderDefaults.timeoutMs)
    const stabilizeMs = parseNonNegativeInteger(req.query.stabilizeMs, renderDefaults.stabilizeMs)
    const threshold = parsePositiveInteger(req.query.threshold, renderDefaults.threshold)
    const mode = req.query.mode === 'bw'
      ? 'bw'
      : req.query.mode === 'gray4' || req.query.mode === undefined
        ? (req.query.mode || renderDefaults.mode)
        : null

    if (!width || !height || !timeoutMs || stabilizeMs === null || !threshold || !mode) {
      return res.status(400).json({
        error: 'Invalid render query. width, height, timeoutMs, and threshold must be positive integers; stabilizeMs must be a non-negative integer; mode must be "gray4" or "bw".',
      })
    }

    try {
      const image = await renderCalendarImage({
        port: process.env.PORT || 3000,
        route: renderDefaults.route,
        timezone: typeof req.query.timezone === 'string' ? req.query.timezone : undefined,
        width,
        height,
        mode,
        timeoutMs,
        stabilizeMs,
        threshold,
      })

      res.setHeader('Content-Type', 'image/png')
      res.setHeader('Cache-Control', 'no-store')
      res.send(image)
    } catch (err) {
      console.error('[render] Failed to render calendar image:', err)
      res.status(500).json({ error: err.message })
    }
  })

  if (existsSync(DIST_DIR)) {
    app.use(express.static(DIST_DIR))
    app.get(/^\/(?!api(?:\/|$)).*/, (_req, res) => {
      res.sendFile(join(DIST_DIR, 'index.html'))
    })
  }

  return app
}

const app = createApp()

/* ------------------------------------------------------------------ */
/* Start                                                                */
/* ------------------------------------------------------------------ */

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Calendar API server listening on port ${PORT}`)
  startScheduler()
})

export { createApp }
