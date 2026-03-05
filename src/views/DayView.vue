<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import EventItem from '../components/EventItem.vue'
import { useCalendar } from '../composables/useCalendar.js'

const { events, loading, error, fetchEvents, loadSources, enabledSources } = useCalendar()

const now = ref(new Date())

// Refresh `now` every minute so the view rolls over naturally at midnight
let timerId
onMounted(() => {
  timerId = setInterval(() => { now.value = new Date() }, 60_000)
})
onUnmounted(() => clearInterval(timerId))

const todayStart = computed(
  () => new Date(now.value.getFullYear(), now.value.getMonth(), now.value.getDate()),
)
const tomorrowStart = computed(
  () => new Date(now.value.getFullYear(), now.value.getMonth(), now.value.getDate() + 1),
)
const dayAfterTomorrowStart = computed(
  () => new Date(now.value.getFullYear(), now.value.getMonth(), now.value.getDate() + 2),
)

// Half-open intervals matching CalendarGrid's overlap logic
const todayEnd = computed(() => tomorrowStart.value)
const tomorrowEnd = computed(() => dayAfterTomorrowStart.value)

const todayLabel = computed(() =>
  now.value.toLocaleDateString('default', { weekday: 'long', month: 'long', day: 'numeric' }),
)
const tomorrowLabel = computed(() =>
  tomorrowStart.value.toLocaleDateString('default', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }),
)

function eventsForDay(dayStart, dayEnd) {
  return events.value.filter((e) => {
    const evtStart = new Date(e.start)
    const evtEnd = e.end ? new Date(e.end) : evtStart
    return evtStart < dayEnd && evtEnd > dayStart
  })
}

const todayEvents = computed(() => eventsForDay(todayStart.value, todayEnd.value))
const tomorrowEvents = computed(() => eventsForDay(tomorrowStart.value, tomorrowEnd.value))

async function loadEvents() {
  await fetchEvents(todayStart.value, tomorrowEnd.value)
}

onMounted(() => {
  loadSources()
  loadEvents()
})
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
      <p v-if="todayEvents.length === 0" class="day-section__empty">No events today.</p>
      <ul v-else class="day-section__list">
        <li v-for="event in todayEvents" :key="event.id">
          <EventItem :event="event" />
        </li>
      </ul>
    </section>

    <section class="day-section day-section--tomorrow">
      <h2 class="day-section__heading day-section__heading--secondary">Tomorrow — {{ tomorrowLabel }}</h2>
      <p v-if="tomorrowEvents.length === 0" class="day-section__empty">No events tomorrow.</p>
      <ul v-else class="day-section__list">
        <li v-for="event in tomorrowEvents" :key="event.id">
          <EventItem :event="event" />
        </li>
      </ul>
    </section>
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
</style>
