/**
 * Calendar API Server
 *
 * Provides REST endpoints for managing calendar sources and fetching events.
 * Sources are persisted to disk; event fetching is done server-side to
 * avoid CORS issues and keep configuration secrets off the client.
 *
 * Endpoints:
 *   GET    /api/sources            List all sources
 *   POST   /api/sources            Add a new source
 *   PATCH  /api/sources/:id        Update a source (config, label, enabled)
 *   DELETE /api/sources/:id        Remove a source
 *   GET    /api/events             Fetch events from all enabled sources
 *                                  Query params: start (ISO), end (ISO)
 */

import express from 'express'
import { loadSources, saveSources } from './storage.js'
import { getPlugin } from './plugins/index.js'

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
  res.status(201).json(newSource)
})

/** PATCH /api/sources/:id */
app.patch('/api/sources/:id', (req, res) => {
  const sources = loadSources()
  const idx = sources.findIndex((s) => s.id === req.params.id)
  if (idx === -1) {
    return res.status(404).json({ error: 'Source not found.' })
  }
  sources[idx] = { ...sources[idx], ...req.body }
  saveSources(sources)
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
  res.status(204).end()
})

/* ------------------------------------------------------------------ */
/* Events                                                               */
/* ------------------------------------------------------------------ */

/** GET /api/events?start=ISO&end=ISO */
app.get('/api/events', async (req, res) => {
  const { start, end } = req.query
  if (!start || !end) {
    return res.status(400).json({ error: 'start and end query parameters are required.' })
  }

  const startDate = new Date(start)
  const endDate = new Date(end)
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return res.status(400).json({ error: 'start and end must be valid ISO date strings.' })
  }

  const sources = loadSources().filter((s) => s.enabled !== false)
  const dateRange = { start: startDate, end: endDate }
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

  res.json({ events, errors })
})

/* ------------------------------------------------------------------ */
/* Start                                                                */
/* ------------------------------------------------------------------ */

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Calendar API server listening on port ${PORT}`)
})
