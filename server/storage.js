/**
 * Persistent storage for calendar sources.
 *
 * Sources are loaded from disk once at startup and kept in memory as the
 * source of truth for all subsequent reads. Writes update the in-memory
 * cache immediately and persist to disk asynchronously so that HTTP
 * handlers are not blocked by file I/O and concurrent mutations always
 * operate on the latest in-memory state.
 *
 * The storage file path is controlled by the DATA_DIR environment variable
 * (default: ./data relative to this file).
 */

import { readFileSync, writeFile, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const DATA_DIR = process.env.DATA_DIR || join(__dirname, 'data')
const SOURCES_FILE = join(DATA_DIR, 'sources.json')

/**
 * Ensure the data directory exists (created lazily on first write).
 */
function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true })
  }
}

/** In-memory cache — null means not yet loaded from disk. */
let _cache = null

/**
 * Return the current sources array, loading from disk the first time.
 * Always returns a shallow copy so callers cannot mutate the cache directly.
 * @returns {object[]}
 */
export function loadSources() {
  if (_cache === null) {
    try {
      _cache = JSON.parse(readFileSync(SOURCES_FILE, 'utf8'))
    } catch {
      _cache = []
    }
  }
  return [..._cache]
}

/**
 * Replace the sources array in memory and asynchronously persist it to disk.
 * The in-memory update is synchronous so subsequent requests see the new
 * state immediately without waiting for the disk write to complete.
 * @param {object[]} sources
 */
export function saveSources(sources) {
  _cache = [...sources]
  ensureDataDir()
  writeFile(SOURCES_FILE, JSON.stringify(sources, null, 2), 'utf8', (err) => {
    if (err) console.error('Failed to persist sources to disk:', err)
  })
}
