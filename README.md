# Calendar

A Vue 3 calendar application that merges events from multiple remote calendar sources and displays them in a unified view. Designed for greyscale eink displays.

## Features

- **Merged calendar view** — pulls events from multiple calendar sources and shows them in a single month grid
- **Plugin system** — extensible architecture for adding new calendar providers
- **Configuration UI** — add, enable/disable, and remove calendar sources without editing code
- **Eink-optimized display** — black-and-white only, no animations, high-contrast, serif typography

## Built-in Calendar Plugins

| Plugin | How it connects |
|---|---|
| **Proton Calendar** | Shared calendar ICS URL |
| **Outlook** | Published ICS URL (Outlook.com or Office 365) |
| **Facebook Events** | Facebook Events ICS export URL |

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Install & Run

```bash
npm install
npm run dev
```

### Build for Production

```bash
npm run build
```

### Run Tests

```bash
npm test
```

## Contributing

### DateTime Rules

**All date/time arithmetic must use [dayjs](https://day.js.org/)** (imported with the `utc`, `customParseFormat`, and `timezone` plugins).  Never use raw JavaScript `Date` arithmetic for anything timezone-sensitive.

| ✅ Correct (DST-aware) | ❌ Incorrect (DST-blind) |
|---|---|
| `dayjs.tz('2026-03-12T12:30:00', 'America/Denver').toDate()` | `new Date(d.getTime() + 7 * 24 * 60 * 60 * 1000)` |
| `dayjs(date).tz(tz).hour()` | `date.getHours()` |
| `dayjs.tz(str, tz).toDate()` | `new Date(Date.UTC(y, m, d, h, min))` |

Raw `Date` methods are unaware of Daylight Saving Time transitions.  A recurring event that starts in winter and runs past a DST boundary will display at the wrong time if its occurrences are generated with fixed UTC-offset arithmetic.

## Adding a New Calendar Plugin

Create a new file in `src/plugins/` exporting a plugin object, then register it in `src/plugins/index.js`:

```js
const MyPlugin = {
  id: 'my-plugin',           // unique identifier
  name: 'My Calendar',       // display name
  description: '...',
  icon: '📆',
  configFields: [
    { key: 'icsUrl', label: 'ICS URL', type: 'url', required: true }
  ],
  validateConfig(config) {
    // return { valid: boolean, errors: string[] }
  },
  async fetchEvents(config, { start, end }) {
    // return array of { id, title, start, end, allDay, description, location, source }
  }
}
```

## Project Structure

```
src/
├── plugins/
│   ├── index.js                  # Plugin registry
│   ├── utils/icsParser.js        # ICS/iCalendar parser
│   ├── ProtonCalendarPlugin.js
│   ├── OutlookPlugin.js
│   └── FacebookEventsPlugin.js
├── composables/
│   └── useCalendar.js            # Shared state (sources, events, fetch)
├── router/
│   └── index.js                  # Vue Router (hash history)
├── views/
│   ├── CalendarView.vue          # Month grid + day detail panel
│   └── ConfigurationView.vue     # Manage calendar sources
└── components/
    ├── CalendarGrid.vue
    ├── EventItem.vue
    └── PluginCard.vue
```
