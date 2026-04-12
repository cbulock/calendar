/**
 * Outlook Plugin
 *
 * Fetches calendar events from a Microsoft Outlook / Office 365 shared calendar
 * using its published ICS URL.
 */

import { parseICSData, expandEvents } from './utils/icsParser.js'

/**
 * Translates Outlook-proprietary busy-state properties into a canonical
 * RFC 5545 status string.  Exported so the server-side plugin registry can
 * import and reuse the exact same logic without duplication.
 *
 * Outlook always exports STATUS:CONFIRMED; the true busy state is carried by
 * X-MICROSOFT-CDO-BUSYSTATUS.  FREE can mean either a declined/removed single
 * occurrence (CANCELLED) or an unanswered recurring-series invite (TENTATIVE).
 *
 * @param {string} status    - The RFC 5545 STATUS value from the VEVENT
 * @param {function} getProp - Returns the uppercased value of a VEVENT property
 * @returns {string} Resolved status ('TENTATIVE', 'CONFIRMED', 'CANCELLED', …)
 */
export function resolveStatus(status, getProp) {
  // Never upgrade a genuinely RFC-cancelled event.  STATUS:CANCELLED takes
  // precedence over any Outlook-proprietary property (e.g. BUSYSTATUS:TENTATIVE
  // on a cancelled recurring-exception VEVENT must not resurface as visible).
  if (status === 'CANCELLED') return 'CANCELLED'

  const busyStatus = getProp('x-microsoft-cdo-busystatus')
  if (busyStatus === 'TENTATIVE') return 'TENTATIVE'
  if (busyStatus === 'FREE') {
    const instType = getProp('x-microsoft-cdo-insttype')
    // X-MICROSOFT-CDO-INSTTYPE=3 marks an exception instance of a recurring series
    // (an "orphan" occurrence).  It does NOT always mean the occurrence was deleted:
    // Outlook also emits INSTTYPE=3 for rescheduled or unanswered exception
    // occurrences.  The reliable signal that Outlook cancels a specific occurrence
    // is the "Canceled: " prefix it adds to the SUMMARY.  Only when that prefix is
    // present do we return CANCELLED; otherwise we fall through to the
    // INTENDEDSTATUS check so unanswered/rescheduled exceptions surface as TENTATIVE.
    if (instType === '3') {
      // getProp() always returns an uppercased, trimmed string (never null), so
      // the uppercase literal comparisons below are correct and safe.
      const summary = getProp('summary')
      if (summary.startsWith('CANCELED:') || summary.startsWith('CANCELLED:')) return 'CANCELLED'
    }
    const intendedStatus = getProp('x-microsoft-cdo-intendedstatus')
    // When the organiser intended this slot to be busy, the recipient simply
    // hasn't responded yet — surface it as TENTATIVE regardless of INSTTYPE.
    // This covers both single-instance unanswered invites (INSTTYPE=0) and
    // recurring-series masters (INSTTYPE=1).
    if (intendedStatus === 'BUSY') return 'TENTATIVE'
    // X-MICROSOFT-CDO-INSTTYPE=1 is the recurring series master; when FREE
    // and not intended as busy, the series is genuinely transparent — keep
    // the original status (typically CONFIRMED) so it still appears.
    if (instType === '1') return status
    // All other INSTTYPE values (0=single, 2=exception, absent, etc.) with
    // FREE and no BUSY intended status are declined or removed occurrences.
    return 'CANCELLED'
  }
  return status
}

// Alias so the plugin object can reference the exported function by a short name.
const outlookResolveStatus = resolveStatus
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
    const rawEvents = parseICSData(icsText, this.id, { resolveStatus: outlookResolveStatus })
    const events = expandEvents(rawEvents, start, end)
    return events.filter((e) => e.end >= start && e.start <= end)
  },
}

export default OutlookPlugin
