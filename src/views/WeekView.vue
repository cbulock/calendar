<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import dayjs from 'dayjs'
import EventItem from '../components/EventItem.vue'
import EventModal from '../components/EventModal.vue'
import { useCalendar } from '../composables/useCalendar.js'
import { useTimezone, getTodayInTimezone, midnightInTimezone } from '../composables/useTimezone.js'

const { events, loading, error, fetchEvents, loadSources, enabledSources, sources } = useCalendar()
const { timezone } = useTimezone()

// Week offset (0 = current week, -1 = previous, +1 = next)
const weekOffset = ref(0)

const todayInTZ = computed(() => getTodayInTimezone(timezone.value))

// Sunday of the displayed week
const weekStart = computed(() => {
  const { year, month, day } = todayInTZ.value
  const d = dayjs(new Date(year, month, day)).add(weekOffset.value * 7, 'day')
  const sunday = d.subtract(d.day(), 'day')
  return midnightInTimezone(sunday.year(), sunday.month(), sunday.date(), timezone.value)
})

// Saturday (end) of the displayed week — exclusive upper bound (midnight Sunday)
const weekEnd = computed(() => dayjs(weekStart.value).add(7, 'day').toDate())

// Build the 7 day columns for the week
const days = computed(() => {
  return Array.from({ length: 7 }, (_, i) => {
    const dayStart = dayjs(weekStart.value).add(i, 'day').toDate()
    const dayEnd = dayjs(dayStart).add(1, 'day').toDate()
    return { dayStart, dayEnd }
  })
})

// Label for the week range displayed in the header
const weekLabel = computed(() => {
  const start = weekStart.value
  const end = dayjs(weekEnd.value).subtract(1, 'day').toDate() // Saturday
  const fmt = (d) =>
    d.toLocaleDateString('default', { month: 'short', day: 'numeric', timeZone: timezone.value })
  const yearStr = end.toLocaleDateString('default', { year: 'numeric', timeZone: timezone.value })
  return `${fmt(start)} – ${fmt(end)}, ${yearStr}`
})

function dayLabel(dayStart) {
  return dayStart.toLocaleDateString('default', {
    weekday: 'short',
    timeZone: timezone.value,
  })
}

function dayNumber(dayStart) {
  return dayStart.toLocaleDateString('default', {
    day: 'numeric',
    timeZone: timezone.value,
  })
}

function eventsForDay(dayStart, dayEnd) {
  return events.value.filter((e) => {
    const evtStart = dayjs(e.start)
    const evtEnd = e.end ? dayjs(e.end) : evtStart
    return evtStart.isBefore(dayEnd) && evtEnd.isAfter(dayStart)
  })
}

// Today parts for highlighting
const todayParts = computed(() => todayInTZ.value)

function isToday(dayStart) {
  const d = dayjs(dayStart)
  const t = todayParts.value
  return d.year() === t.year && d.month() === t.month && d.date() === t.day
}

async function loadEvents() {
  await fetchEvents(weekStart.value, weekEnd.value)
}

onMounted(() => {
  loadSources()
  loadEvents()
})

watch([weekOffset, timezone], () => { loadEvents() })

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
  <div class="week-view">
    <div v-if="loading" class="status-bar" role="status">Loading events…</div>
    <div v-if="error" class="status-bar status-bar--error" role="alert">
      <strong>Some calendars failed to load:</strong>
      <pre>{{ error }}</pre>
    </div>
    <div v-if="enabledSources.length === 0" class="status-bar">
      No calendars configured.
    </div>

    <div class="week-header">
      <button class="nav-btn" @click="weekOffset--" aria-label="Previous week">&#8249;</button>
      <span class="week-label">{{ weekLabel }}</span>
      <button class="nav-btn" @click="weekOffset++" aria-label="Next week">&#8250;</button>
    </div>

    <div class="week-grid">
      <div
        v-for="({ dayStart, dayEnd }, idx) in days"
        :key="idx"
        class="week-col"
        :class="{ 'week-col--today': isToday(dayStart) }"
      >
        <div class="week-col__header">
          <div class="week-col__weekday">{{ dayLabel(dayStart) }}</div>
          <div class="week-col__day" :class="{ 'week-col__day--today': isToday(dayStart) }">
            {{ dayNumber(dayStart) }}
          </div>
        </div>
        <div class="week-col__events">
          <p v-if="eventsForDay(dayStart, dayEnd).length === 0" class="week-col__empty">—</p>
          <EventItem
            v-for="event in eventsForDay(dayStart, dayEnd)"
            :key="event.id"
            :event="event"
            @select="openEvent"
          />
        </div>
      </div>
    </div>

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
.week-view {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
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

.week-header {
  display: flex;
  align-items: center;
  background: #000;
  color: #fff;
  border: 1px solid #000;
}

.nav-btn {
  background: transparent;
  color: #fff;
  border: none;
  font-size: 1.4rem;
  line-height: 1;
  padding: 0.3rem 0.6rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.nav-btn:hover {
  background: #333;
}

.nav-btn:focus-visible {
  outline: 2px solid #fff;
  outline-offset: -2px;
}

.week-label {
  flex: 1;
  text-align: center;
  font-size: 1rem;
  font-weight: bold;
  padding: 0.4rem 0;
  letter-spacing: 0.04em;
}

.week-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  border: 1px solid #000;
  border-right: none;
  border-top: none;
}

.week-col {
  border-right: 1px solid #000;
  border-top: 1px solid #000;
  min-width: 0;
}

.week-col--today {
  background: #f8f8f8;
}

.week-col__header {
  text-align: center;
  padding: 0.25rem 0.1rem;
  border-bottom: 1px solid #000;
  background: #111;
  color: #fff;
}

.week-col--today .week-col__header {
  background: #444;
}

.week-col__weekday {
  font-size: 0.65rem;
  font-weight: bold;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #ccc;
}

.week-col__day {
  font-size: 0.9rem;
  font-weight: bold;
  line-height: 1.6;
}

.week-col__day--today {
  display: inline-block;
  background: #fff;
  color: #000;
  border-radius: 50%;
  width: 1.6em;
  height: 1.6em;
  line-height: 1.6em;
  text-align: center;
}

.week-col__events {
  padding: 0.25rem 0.2rem;
}

.week-col__empty {
  font-size: 0.7rem;
  color: #bbb;
  text-align: center;
  margin: 0.5rem 0;
}
</style>
