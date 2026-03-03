/**
 * Proton Calendar Plugin
 *
 * Fetches calendar events from a Proton Calendar shared calendar URL (ICS format).
 * Proton Calendar allows sharing via encrypted ICS links.
 */

import { parseICSData } from './utils/icsParser.js'

const ProtonCalendarPlugin = {
  id: 'proton-calendar',
  name: 'Proton Calendar',
  description: 'Import events from a Proton Calendar shared calendar via ICS URL.',
  icon: '🔒',

  configFields: [
    {
      key: 'icsUrl',
      label: 'ICS Calendar URL',
      type: 'url',
      required: true,
      placeholder: 'https://calendar.proton.me/api/calendar/v1/url/...',
    },
    {
      key: 'calendarName',
      label: 'Display Name',
      type: 'text',
      required: false,
      placeholder: 'My Proton Calendar',
    },
  ],

  validateConfig(config) {
    const errors = []
    if (!config.icsUrl || !config.icsUrl.trim()) {
      errors.push('ICS Calendar URL is required.')
    } else {
      try {
        const url = new URL(config.icsUrl)
        if (!['http:', 'https:'].includes(url.protocol)) {
          errors.push('ICS Calendar URL must use HTTP or HTTPS.')
        }
      } catch {
        errors.push('ICS Calendar URL must be a valid URL.')
      }
    }
    return { valid: errors.length === 0, errors }
  },

  async fetchEvents(config, dateRange) {
    const { start, end } = dateRange
    const response = await fetch(config.icsUrl)
    if (!response.ok) {
      throw new Error(`Failed to fetch Proton Calendar: ${response.statusText}`)
    }
    const icsText = await response.text()
    const events = parseICSData(icsText, this.id)
    return events.filter((e) => e.end >= start && e.start <= end)
  },
}

export default ProtonCalendarPlugin
