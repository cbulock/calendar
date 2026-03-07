<script setup>
import { computed, onMounted } from 'vue'
import CalendarGrid from '../components/CalendarGrid.vue'
import { useCalendar } from '../composables/useCalendar.js'
import { useTimezone, getTodayInTimezone, midnightInTimezone } from '../composables/useTimezone.js'

const { events, loading, error, fetchEvents, loadSources, enabledSources } = useCalendar()
const { timezone } = useTimezone()

// Always display the current month in the configured timezone
const todayInTZ = computed(() => getTodayInTimezone(timezone.value))
const currentYear = computed(() => todayInTZ.value.year)
const currentMonth = computed(() => todayInTZ.value.month)

const monthStart = computed(() => midnightInTimezone(currentYear.value, currentMonth.value, 1, timezone.value))
const monthEnd = computed(() => midnightInTimezone(currentYear.value, currentMonth.value + 1, 1, timezone.value))

async function loadEvents() {
  await fetchEvents(monthStart.value, monthEnd.value)
}

onMounted(() => {
  loadSources()
  loadEvents()
})
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
      :year="currentYear"
      :month="currentMonth"
      :events="events"
      :timezone="timezone"
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
