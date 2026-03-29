/**
 * Outlook Plugin
 *
 * Fetches calendar events from a Microsoft Outlook / Office 365 shared calendar
 * using its published ICS URL.
 */

import { parseICSData, expandEvents } from './utils/icsParser.js'

const OutlookPlugin = {
  id: 'outlook',
  name: 'Outlook',
  description:
    'Import events from a Microsoft Outlook or Office 365 calendar via a published ICS URL.',
  icon: '📅',

  configFields: [
    {
      key: 'icsUrl',
      label: 'Published ICS URL',
      type: 'url',
      required: true,
      placeholder: 'https://outlook.live.com/owa/calendar/...ics',
    },
    {
      key: 'calendarName',
      label: 'Display Name',
      type: 'text',
      required: false,
      placeholder: 'My Outlook Calendar',
    },
  ],

  validateConfig(config) {
    const errors = []
    if (!config.icsUrl || !config.icsUrl.trim()) {
      errors.push('Published ICS URL is required.')
    } else {
      try {
        const url = new URL(config.icsUrl)
        if (!['http:', 'https:'].includes(url.protocol)) {
          errors.push('Published ICS URL must use HTTP or HTTPS.')
        }
      } catch {
        errors.push('Published ICS URL must be a valid URL.')
      }
    }
    return { valid: errors.length === 0, errors }
  },

  async fetchEvents(config, dateRange) {
    const { start, end } = dateRange
    const response = await fetch(config.icsUrl)
    if (!response.ok) {
      throw new Error(`Failed to fetch Outlook calendar: ${response.statusText}`)
    }
    const icsText = await response.text()
    const rawEvents = parseICSData(icsText, this.id, {
      // Outlook always exports STATUS:CONFIRMED; the proprietary
      // X-MICROSOFT-CDO-BUSYSTATUS property carries the true busy state.
      resolveStatus(status, getProp) {
        const busyStatus = getProp('x-microsoft-cdo-busystatus')
        if (busyStatus === 'TENTATIVE') return 'TENTATIVE'
        if (busyStatus === 'FREE') return 'CANCELLED'
        return status
      },
    })
    const events = expandEvents(rawEvents, start, end)
    return events.filter((e) => e.end >= start && e.start <= end)
  },
}

export default OutlookPlugin
