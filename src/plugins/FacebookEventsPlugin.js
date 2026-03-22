/**
 * Facebook Events Plugin
 *
 * Fetches calendar events from a Facebook Events calendar using its
 * exported ICS feed URL.
 */

import { parseICSData, expandEvents } from './utils/icsParser.js'

const FacebookEventsPlugin = {
  id: 'facebook-events',
  name: 'Facebook Events',
  description:
    'Import events from Facebook using the Facebook Events ICS export URL from your account.',
  icon: '👥',

  configFields: [
    {
      key: 'icsUrl',
      label: 'Facebook Events ICS URL',
      type: 'url',
      required: true,
      placeholder: 'https://www.facebook.com/ical/u.php?uid=...&key=...',
    },
    {
      key: 'calendarName',
      label: 'Display Name',
      type: 'text',
      required: false,
      placeholder: 'Facebook Events',
    },
  ],

  validateConfig(config) {
    const errors = []
    if (!config.icsUrl || !config.icsUrl.trim()) {
      errors.push('Facebook Events ICS URL is required.')
    } else {
      try {
        const url = new URL(config.icsUrl)
        if (!['http:', 'https:', 'webcal:'].includes(url.protocol)) {
          errors.push('Facebook Events ICS URL must use HTTP, HTTPS, or webcal.')
        }
      } catch {
        errors.push('Facebook Events ICS URL must be a valid URL.')
      }
    }
    return { valid: errors.length === 0, errors }
  },

  async fetchEvents(config, dateRange) {
    const { start, end } = dateRange
    // Normalize webcal:// to https:// for fetch compatibility
    const fetchUrl = config.icsUrl.replace(/^webcal:/i, 'https:')
    const response = await fetch(fetchUrl)
    if (!response.ok) {
      throw new Error(`Failed to fetch Facebook Events: ${response.statusText}`)
    }
    const icsText = await response.text()
    const rawEvents = parseICSData(icsText, this.id, {
      // Facebook emits a top-level PARTSTAT:TENTATIVE property on the VEVENT
      // (distinct from PARTSTAT as a parameter on an ATTENDEE line) to indicate
      // the user's tentative acceptance alongside STATUS:CONFIRMED.
      resolveStatus(status, getProp) {
        if (getProp('partstat') === 'TENTATIVE') return 'TENTATIVE'
        return status
      },
    })
    const events = expandEvents(rawEvents, start, end)
    return events.filter((e) => e.end >= start && e.start <= end)
  },
}

export default FacebookEventsPlugin
