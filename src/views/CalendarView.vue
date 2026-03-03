<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import CalendarGrid from '../components/CalendarGrid.vue'
import EventItem from '../components/EventItem.vue'
import { useCalendar } from '../composables/useCalendar.js'

const { events, loading, error, fetchEvents, enabledSources } = useCalendar()

// Current month/year displayed
const today = new Date()
const currentYear = ref(today.getFullYear())
const currentMonth = ref(today.getMonth())

// Selected day for event list panel
const selectedDate = ref(null)

const monthStart = computed(() => new Date(currentYear.value, currentMonth.value, 1))
const monthEnd = computed(() => new Date(currentYear.value, currentMonth.value + 1, 0, 23, 59, 59))

// Events for the selected day
const selectedDayEvents = computed(() => {
  if (!selectedDate.value) return []
  const d = selectedDate.value
  return events.value.filter((e) => {
    const evtStart = new Date(e.start)
    return (
      evtStart.getFullYear() === d.getFullYear() &&
      evtStart.getMonth() === d.getMonth() &&
      evtStart.getDate() === d.getDate()
    )
  })
})

function prevMonth() {
  if (currentMonth.value === 0) {
    currentMonth.value = 11
    currentYear.value--
  } else {
    currentMonth.value--
  }
}

function nextMonth() {
  if (currentMonth.value === 11) {
    currentMonth.value = 0
    currentYear.value++
  } else {
    currentMonth.value++
  }
}

function goToToday() {
  const now = new Date()
  currentYear.value = now.getFullYear()
  currentMonth.value = now.getMonth()
}

function handleDaySelect(date) {
  selectedDate.value = date
}

async function loadEvents() {
  await fetchEvents(monthStart.value, monthEnd.value)
}

onMounted(loadEvents)

watch([currentYear, currentMonth], loadEvents)

function formatSelectedDate(date) {
  if (!date) return ''
  return date.toLocaleDateString('default', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}
</script>

<template>
  <div class="calendar-view">
    <div class="calendar-view__toolbar">
      <button class="btn" @click="prevMonth" aria-label="Previous month">◀</button>
      <button class="btn btn--today" @click="goToToday">Today</button>
      <button class="btn" @click="nextMonth" aria-label="Next month">▶</button>
    </div>

    <div v-if="loading" class="status-bar" role="status">Loading events…</div>
    <div v-if="error" class="status-bar status-bar--error" role="alert">
      <strong>Some calendars failed to load:</strong>
      <pre>{{ error }}</pre>
    </div>
    <div v-if="enabledSources.length === 0" class="status-bar">
      No calendars configured.
      <router-link to="/config">Add one in Configuration.</router-link>
    </div>

    <CalendarGrid
      :year="currentYear"
      :month="currentMonth"
      :events="events"
      @select-day="handleDaySelect"
    />

    <div v-if="selectedDate" class="day-panel">
      <div class="day-panel__header">
        {{ formatSelectedDate(selectedDate) }}
        <button class="btn day-panel__close" @click="selectedDate = null" aria-label="Close">✕</button>
      </div>
      <div class="day-panel__body">
        <p v-if="selectedDayEvents.length === 0" class="day-panel__empty">No events this day.</p>
        <EventItem
          v-for="event in selectedDayEvents"
          :key="event.id"
          :event="event"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.calendar-view {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.calendar-view__toolbar {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.btn {
  padding: 0.3rem 0.7rem;
  border: 2px solid #000;
  background: #fff;
  color: #000;
  cursor: pointer;
  font-size: 0.85rem;
  font-family: inherit;
  font-weight: bold;
}

.btn:hover {
  background: #000;
  color: #fff;
}

.btn--today {
  flex: 1;
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

.day-panel {
  border: 1px solid #000;
}

.day-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.4rem 0.6rem;
  background: #000;
  color: #fff;
  font-weight: bold;
  font-size: 0.9rem;
}

.day-panel__close {
  background: transparent;
  color: #fff;
  border-color: #fff;
  padding: 0.1rem 0.4rem;
  font-size: 0.8rem;
}

.day-panel__close:hover {
  background: #fff;
  color: #000;
}

.day-panel__body {
  padding: 0.5rem;
}

.day-panel__empty {
  font-size: 0.85rem;
  color: #555;
  margin: 0;
}
</style>
