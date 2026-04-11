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
        if (busyStatus === 'FREE') {
          // X-MICROSOFT-CDO-INSTTYPE=1 marks this VEVENT as the master of a
          // recurring series.  Treat FREE as CANCELLED for any event whose
          // INSTTYPE is not '1' (i.e. a declined or removed single occurrence).
          const instType = getProp('x-microsoft-cdo-insttype')
          if (instType !== '1') return 'CANCELLED'
          // For recurring series masters (INSTTYPE=1), FREE can mean two things:
          //   1. The organiser intended the event to block time (INTENDEDSTATUS=BUSY)
          //      but the recipient hasn't responded yet — show as TENTATIVE.
          //   2. The event is genuinely transparent (INTENDEDSTATUS=FREE or absent)
          //      — keep the original status (typically CONFIRMED).
          const intendedStatus = getProp('x-microsoft-cdo-intendedstatus')
          if (intendedStatus === 'BUSY') return 'TENTATIVE'
          return status
        }
        return status
      },
    })
    const events = expandEvents(rawEvents, start, end)
    return events.filter((e) => e.end >= start && e.start <= end)
  },
}

export default OutlookPlugin
