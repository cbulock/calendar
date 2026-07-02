import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { chromium } from 'playwright-core'

const DEFAULT_RENDER_WIDTH = 800
const DEFAULT_RENDER_HEIGHT = 480
const DEFAULT_RENDER_TIMEOUT_MS = 15_000
const DEFAULT_RENDER_STABILIZE_MS = 750
const DEFAULT_RENDER_ROUTE = '/day'
const DEFAULT_RENDER_MODE = 'gray4'
const DEFAULT_BW_THRESHOLD = 185

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST_DIR = join(__dirname, '..', 'dist')

function detectBrowserExecutable() {
  const configuredPath = process.env.CALENDAR_RENDER_BROWSER_PATH
  if (configuredPath && existsSync(configuredPath)) {
    return configuredPath
  }

  const candidates = [
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  const which = spawnSync(
    'bash',
    ['-lc', 'command -v google-chrome || command -v chromium || command -v chromium-browser'],
    { encoding: 'utf8' },
  )

  if (which.status === 0) {
    const resolved = which.stdout.trim()
    if (resolved) return resolved
  }

  throw new Error(
    'No compatible Chrome/Chromium executable found. Set CALENDAR_RENDER_BROWSER_PATH to an installed browser.',
  )
}

function normalizeRoute(route = DEFAULT_RENDER_ROUTE) {
  if (!route.startsWith('/')) {
    return `/${route}`
  }
  return route
}

function normalizeTimezone(timezone) {
  if (typeof timezone !== 'string') return undefined
  const candidate = timezone.trim()
  if (!candidate) return undefined
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date())
    return candidate
  } catch {
    return undefined
  }
}

function resolveRenderBaseUrl(port) {
  if (process.env.CALENDAR_RENDER_BASE_URL) {
    return process.env.CALENDAR_RENDER_BASE_URL
  }

  if (existsSync(DIST_DIR)) {
    return `http://127.0.0.1:${port}`
  }

  return 'http://127.0.0.1:5173'
}

function buildRenderUrl({
  port,
  route = DEFAULT_RENDER_ROUTE,
  timezone,
}) {
  const baseUrl = resolveRenderBaseUrl(port).replace(/\/$/, '')
  const params = new URLSearchParams({ render: '1' })
  const normalizedTimezone = normalizeTimezone(timezone)
  if (normalizedTimezone) {
    params.set('timezone', normalizedTimezone)
  }
  return `${baseUrl}/#${normalizeRoute(route)}?${params}`
}

function quantize(value, mode, threshold) {
  if (mode === 'bw') {
    return value < threshold ? 0 : 255
  }
  return value < 64 ? 0 : value < 128 ? 85 : value < 192 ? 170 : 255
}

export async function convertScreenshotToRenderPng(
  buffer,
  {
    width = DEFAULT_RENDER_WIDTH,
    height = DEFAULT_RENDER_HEIGHT,
    mode = DEFAULT_RENDER_MODE,
    threshold = DEFAULT_BW_THRESHOLD,
  } = {},
) {
  const image = sharp(buffer)
    .removeAlpha()
    .flatten({ background: '#ffffff' })
    .grayscale()
    .normalize()
    .resize(width, height, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })

  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true })

  const output = Buffer.alloc(data.length)
  for (let index = 0; index < data.length; index += 1) {
    output[index] = quantize(data[index], mode, threshold)
  }

  return sharp(output, {
    raw: {
      width: info.width,
      height: info.height,
      channels: info.channels,
    },
  }).png().toBuffer()
}

export async function renderCalendarImage({
  port,
  route = DEFAULT_RENDER_ROUTE,
  timezone,
  width = DEFAULT_RENDER_WIDTH,
  height = DEFAULT_RENDER_HEIGHT,
  mode = DEFAULT_RENDER_MODE,
  threshold = DEFAULT_BW_THRESHOLD,
  timeoutMs = DEFAULT_RENDER_TIMEOUT_MS,
  stabilizeMs = DEFAULT_RENDER_STABILIZE_MS,
} = {}) {
  const normalizedTimezone = normalizeTimezone(timezone)
  const executablePath = detectBrowserExecutable()
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
  })

  try {
    const page = await browser.newPage({
      viewport: { width, height },
      colorScheme: 'light',
      deviceScaleFactor: 2,
    })

    if (normalizedTimezone) {
      await page.addInitScript((tz) => {
        localStorage.setItem('calendar_timezone', tz)
        localStorage.setItem('calendar_dark_mode', 'false')
      }, normalizedTimezone)
    } else {
      await page.addInitScript(() => {
        localStorage.setItem('calendar_dark_mode', 'false')
      })
    }

    const url = buildRenderUrl({ port, route, timezone: normalizedTimezone })
    await page.goto(url, { waitUntil: 'networkidle', timeout: timeoutMs })
    await page.waitForSelector('[data-render-ready="true"]', { timeout: timeoutMs })

    if (stabilizeMs > 0) {
      await page.waitForTimeout(stabilizeMs)
    }

    const screenshot = await page.screenshot({ type: 'png' })
    return convertScreenshotToRenderPng(screenshot, { width, height, mode, threshold })
  } finally {
    await browser.close()
  }
}

export const renderDefaults = {
  width: DEFAULT_RENDER_WIDTH,
  height: DEFAULT_RENDER_HEIGHT,
  mode: DEFAULT_RENDER_MODE,
  threshold: DEFAULT_BW_THRESHOLD,
  route: DEFAULT_RENDER_ROUTE,
  timeoutMs: DEFAULT_RENDER_TIMEOUT_MS,
  stabilizeMs: DEFAULT_RENDER_STABILIZE_MS,
}
