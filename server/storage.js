/**
 * Persistent storage for calendar sources.
 *
 * Sources are saved to a JSON file on disk so they survive server restarts.
 * The storage file path is controlled by the DATA_DIR environment variable
 * (default: ./data relative to this file).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const DATA_DIR = process.env.DATA_DIR || join(__dirname, 'data')
const SOURCES_FILE = join(DATA_DIR, 'sources.json')

/**
 * Ensure the data directory and file exist.
 */
function ensureStorage() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true })
  }
  if (!existsSync(SOURCES_FILE)) {
    writeFileSync(SOURCES_FILE, '[]', 'utf8')
  }
}

/**
 * Load all sources from disk.
 * @returns {object[]}
 */
export function loadSources() {
  ensureStorage()
  try {
    return JSON.parse(readFileSync(SOURCES_FILE, 'utf8'))
  } catch {
    return []
  }
}

/**
 * Persist the given sources array to disk.
 * @param {object[]} sources
 */
export function saveSources(sources) {
  ensureStorage()
  writeFileSync(SOURCES_FILE, JSON.stringify(sources, null, 2), 'utf8')
}
