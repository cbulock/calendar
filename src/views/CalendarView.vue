<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import CalendarGrid from '../components/CalendarGrid.vue'
import EventModal from '../components/EventModal.vue'
import { useCalendar } from '../composables/useCalendar.js'
import { useTimezone, getTodayInTimezone, midnightInTimezone } from '../composables/useTimezone.js'

const { events, loading, error, fetchEvents, loadSources, enabledSources, sources } = useCalendar()
const { timezone } = useTimezone()

// Month offset (0 = current month, -1 = previous, +1 = next, etc.)
const monthOffset = ref(0)

const todayInTZ = computed(() => getTodayInTimezone(timezone.value))

// Derive display year/month from today + offset
const displayYear = computed(() => {
  const d = new Date(todayInTZ.value.year, todayInTZ.value.month + monthOffset.value, 1)
  return d.getFullYear()
})
const displayMonth = computed(() => {
  const d = new Date(todayInTZ.value.year, todayInTZ.value.month + monthOffset.value, 1)
  return d.getMonth()
})

const monthStart = computed(() => midnightInTimezone(displayYear.value, displayMonth.value, 1, timezone.value))
const monthEnd = computed(() => midnightInTimezone(displayYear.value, displayMonth.value + 1, 1, timezone.value))

async function loadEvents() {
  await fetchEvents(monthStart.value, monthEnd.value)
}

onMounted(() => {
  loadSources()
  loadEvents()
})

watch([monthOffset, timezone], () => { loadEvents() })

// Event details modal
const selectedEvent = ref(null)

function openEvent(event) {
  selectedEvent.value = event
}
function closeEvent() {
  selectedEvent.value = null
}

// Resolve source label by sourceId for the modal
function sourceLabelFor(sourceId) {
  const src = sources.value.find((s) => s.id === sourceId)
  return src ? src.label : sourceId || ''
}
</script>

<template>
  <div class="calendar-view">
    <div v-if="loading" class="status-bar" role="status">Loading events…</div>
    <div v-if="error" class="status-bar status-bar--error" role="alert">
      <strong>Some calendars failed to load:</strong>
      <pre>{{ error }}</pre>
    </div>
    <div v-if="enabledSources.length === 0" class="status-bar">
      No calendars configured.
    </div>

    <CalendarGrid
      :year="displayYear"
      :month="displayMonth"
      :events="events"
      :timezone="timezone"
      @prev="monthOffset--"
      @next="monthOffset++"
      @event-click="openEvent"
    />

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
.calendar-view {
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
</style>
