<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import EventItem from '../components/EventItem.vue'
import EventModal from '../components/EventModal.vue'
import { useCalendar } from '../composables/useCalendar.js'
import { useTimezone, midnightInTimezone, getTodayInTimezone } from '../composables/useTimezone.js'

const { events, loading, error, fetchEvents, loadSources, enabledSources, sources } = useCalendar()
const { timezone } = useTimezone()

const now = ref(new Date())

// Refresh `now` every minute so the view rolls over naturally at midnight
let timerId
onMounted(() => {
  timerId = setInterval(() => { now.value = new Date() }, 60_000)
})
onUnmounted(() => clearInterval(timerId))

// Compute today/tomorrow/day-after-tomorrow boundaries in the configured timezone.
// Depends on both `now` (updated every minute) and `timezone` so the view
// rolls over to the next day at midnight without needing a full reload.
const todayParts = computed(() => {
  // Reference now.value so Vue tracks it as a dependency; the actual date
  // parts are derived from the current wall-clock time in the selected zone.
  void now.value
  return getTodayInTimezone(timezone.value)
})
const todayStart = computed(() =>
  midnightInTimezone(todayParts.value.year, todayParts.value.month, todayParts.value.day, timezone.value),
)
const tomorrowStart = computed(() =>
  midnightInTimezone(todayParts.value.year, todayParts.value.month, todayParts.value.day + 1, timezone.value),
)
const dayAfterTomorrowStart = computed(() =>
  midnightInTimezone(todayParts.value.year, todayParts.value.month, todayParts.value.day + 2, timezone.value),
)

// Half-open intervals matching CalendarGrid's overlap logic
const todayEnd = computed(() => tomorrowStart.value)
const tomorrowEnd = computed(() => dayAfterTomorrowStart.value)

// UTC-based day boundaries for floating-time events.
// Floating times are stored with their wall-clock hours/minutes in UTC (e.g.,
// a "9 AM" floating event is stored as T09:00:00Z).  Filtering them against
// timezone-aware boundaries would shift them by the UTC offset, placing them
// on the wrong day for non-UTC users.  Using UTC midnight avoids that.
const todayUTCStart = computed(() =>
  new Date(Date.UTC(todayParts.value.year, todayParts.value.month, todayParts.value.day)),
)
const tomorrowUTCStart = computed(() =>
  new Date(Date.UTC(todayParts.value.year, todayParts.value.month, todayParts.value.day + 1)),
)
const dayAfterTomorrowUTCStart = computed(() =>
  new Date(Date.UTC(todayParts.value.year, todayParts.value.month, todayParts.value.day + 2)),
)

const todayLabel = computed(() =>
  now.value.toLocaleDateString('default', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: timezone.value,
  }),
)
const tomorrowLabel = computed(() =>
  tomorrowStart.value.toLocaleDateString('default', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: timezone.value,
  }),
)

function eventsForDay(dayStart, dayEnd, utcDayStart, utcDayEnd) {
  return events.value.filter((e) => {
    const evtStart = new Date(e.start)
    const evtEnd = e.end ? new Date(e.end) : evtStart
    if (e.floating) {
      // Floating-time events: filter by UTC day boundaries so their wall-clock
      // date is honoured regardless of the viewer's UTC offset.
      return evtStart < utcDayEnd && evtEnd > utcDayStart
    }
    return evtStart < dayEnd && evtEnd > dayStart
  })
}

const todayEvents = computed(() =>
  eventsForDay(todayStart.value, todayEnd.value, todayUTCStart.value, tomorrowUTCStart.value),
)
const tomorrowEvents = computed(() =>
  eventsForDay(tomorrowStart.value, tomorrowEnd.value, tomorrowUTCStart.value, dayAfterTomorrowUTCStart.value),
)

// For floating-time events the current wall-clock time in the configured
// timezone, encoded as a UTC timestamp so it can be compared directly with
// floating event times (which are stored as UTC wall-clock values).
const nowWallClockMs = computed(() => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone.value,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now.value).reduce((acc, { type, value }) => {
    if (type !== 'literal') acc[type] = Number(value)
    return acc
  }, { year: 0, month: 1, day: 1, hour: 0, minute: 0, second: 0 })
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
})

// Formatted current time label for the now indicator
const nowTimeLabel = computed(() =>
  now.value.toLocaleTimeString('default', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone.value,
  }),
)

// Today's events sorted by start time (all-day events first, then by start)
const sortedTodayEvents = computed(() =>
  [...todayEvents.value].sort((a, b) => {
    if (a.allDay && !b.allDay) return -1
    if (!a.allDay && b.allDay) return 1
    return new Date(a.start) - new Date(b.start)
  }),
)

// Index in sortedTodayEvents where the now indicator should be inserted.
// Events before this index have already started; events at/after are upcoming.
const nowLineIndex = computed(() => {
  const nowMs = now.value.getTime()
  const nowWCMs = nowWallClockMs.value
  const idx = sortedTodayEvents.value.findIndex((e) => {
    const startMs = new Date(e.start).getTime()
    return e.floating ? startMs > nowWCMs : startMs > nowMs
  })
  return idx === -1 ? sortedTodayEvents.value.length : idx
})

// Returns true when an event has completely ended before now.
// Events without an explicit end time are treated as zero-duration (start === end)
// and are considered past once their start time has passed.
function isPastEvent(event) {
  const evtEnd = event.end ? new Date(event.end) : new Date(event.start)
  if (event.floating) {
    return evtEnd.getTime() < nowWallClockMs.value
  }
  return evtEnd.getTime() < now.value.getTime()
}

async function loadEvents() {
  // Fetch events covering both timezone-aware and UTC day boundaries so that
  // floating-time events (which are filtered by UTC day) are included even
  // when the user's UTC offset would otherwise exclude them (e.g. a floating
  // "02:00" event for a UTC-5 user whose TZ day starts at 05:00 UTC).
  const fetchStart = new Date(Math.min(todayStart.value.getTime(), todayUTCStart.value.getTime()))
  const fetchEnd = new Date(Math.max(tomorrowEnd.value.getTime(), dayAfterTomorrowUTCStart.value.getTime()))
  await fetchEvents(fetchStart, fetchEnd)
}

onMounted(() => {
  loadSources()
  loadEvents()
})

// Re-fetch when the configured timezone changes because the day boundaries shift
watch(timezone, () => { loadEvents() })

// Event details modal
const selectedEvent = ref(null)

function openEvent(event) {
  selectedEvent.value = event
}
function closeEvent() {
  selectedEvent.value = null
}

function sourceLabelFor(sourceId) {
  const src = sources.value.find((s) => s.id === sourceId)
  return src ? src.label : sourceId || ''
}
</script>

<template>
  <div class="day-view">
    <div v-if="loading" class="status-bar" role="status">Loading events…</div>
    <div v-if="error" class="status-bar status-bar--error" role="alert">
      <strong>Some calendars failed to load:</strong>
      <pre>{{ error }}</pre>
    </div>
    <div v-if="enabledSources.length === 0" class="status-bar">
      No calendars configured.
    </div>

    <section class="day-section day-section--today">
      <h2 class="day-section__heading">{{ todayLabel }}</h2>
      <template v-if="sortedTodayEvents.length === 0">
        <div class="now-indicator" :aria-label="`Now • ${nowTimeLabel}`">
          <span class="now-indicator__time" aria-hidden="true">Now • {{ nowTimeLabel }}</span>
        </div>
        <p class="day-section__empty">No events today.</p>
      </template>
      <ul v-else class="day-section__list">
        <template v-for="(event, idx) in sortedTodayEvents" :key="event.id">
          <li v-if="idx === nowLineIndex" class="now-indicator" :aria-label="`Now • ${nowTimeLabel}`">
            <span class="now-indicator__time" aria-hidden="true">Now • {{ nowTimeLabel }}</span>
          </li>
          <li>
            <EventItem :event="event" :past="isPastEvent(event)" @select="openEvent" />
          </li>
        </template>
        <li v-if="nowLineIndex >= sortedTodayEvents.length" class="now-indicator" :aria-label="`Now • ${nowTimeLabel}`">
          <span class="now-indicator__time" aria-hidden="true">Now • {{ nowTimeLabel }}</span>
        </li>
      </ul>
    </section>

    <section class="day-section day-section--tomorrow">
      <h2 class="day-section__heading day-section__heading--secondary">Tomorrow — {{ tomorrowLabel }}</h2>
      <p v-if="tomorrowEvents.length === 0" class="day-section__empty">No events tomorrow.</p>
      <ul v-else class="day-section__list">
        <li v-for="event in tomorrowEvents" :key="event.id">
          <EventItem :event="event" @select="openEvent" />
        </li>
      </ul>
    </section>

    <EventModal
      v-if="selectedEvent"
      :event="selectedEvent"
      :source-label="sourceLabelFor(selectedEvent.sourceId)"
      :timezone="timezone"
      @close="closeEvent"
    />
  </div>
</template>

<style scoped>
.day-view {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.status-bar {
  padding: 0.4rem 0.6rem;
  border: 1px solid #000;
  font-size: 0.85rem;
  background: #eee;
}

.status-bar--error {
  background: #ddd;
  border-color: #000;
}

.status-bar pre {
  margin: 0.25rem 0 0;
  font-size: 0.75rem;
  white-space: pre-wrap;
}

.day-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.day-section__heading {
  margin: 0;
  padding-bottom: 0.35rem;
  border-bottom: 2px solid #000;
  font-size: 1.15rem;
  font-weight: bold;
  letter-spacing: 0.03em;
}

.day-section__heading--secondary {
  font-size: 0.9rem;
  font-weight: bold;
  border-bottom-width: 1px;
  color: #444;
}

.day-section__empty {
  font-size: 0.85rem;
  color: #555;
  margin: 0;
}

.day-section__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.day-section--tomorrow .day-section__list {
  opacity: 0.65;
}

.now-indicator {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0.1rem 0;
  color: #888;
  font-size: 0.72rem;
  font-weight: bold;
  list-style: none;
}

.now-indicator::before,
.now-indicator::after {
  content: '';
  flex: 1;
  height: 1px;
  background: #bbb;
}

.now-indicator__time {
  white-space: nowrap;
}
</style>
