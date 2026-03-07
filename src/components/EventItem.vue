<script setup>
import { useTimezone } from '../composables/useTimezone.js'

const props = defineProps({
  event: {
    type: Object,
    required: true,
  },
})

const { timezone } = useTimezone()

function formatTime(date) {
  if (!date) return ''
  const d = new Date(date)
  return d.toLocaleTimeString('default', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone.value,
  })
}

function formatDuration(start, end) {
  if (!start || !end) return ''
  const ms = new Date(end) - new Date(start)
  if (!Number.isFinite(ms) || ms <= 0) return ''
  const totalMinutes = Math.max(1, Math.floor(ms / 60_000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes} min`
  if (minutes === 0) return `${hours} hr`
  return `${hours} hr ${minutes} min`
}
</script>

<template>
  <div class="event-item">
    <div class="event-item__time" v-if="!event.allDay">
      {{ formatTime(event.start) }}
    </div>
    <div class="event-item__time event-item__time--allday" v-else>All day</div>
    <div class="event-item__title">{{ event.title }}</div>
    <div class="event-item__duration" v-if="!event.allDay && !!formatDuration(event.start, event.end)">
      {{ formatDuration(event.start, event.end) }}
    </div>
  </div>
</template>

<style scoped>
.event-item {
  border: 1px solid #000;
  padding: 0.4rem 0.6rem;
  margin-bottom: 0.4rem;
}

.event-item__time {
  font-size: 0.7rem;
  font-weight: bold;
  color: #444;
}

.event-item__time--allday {
  font-style: italic;
}

.event-item__title {
  font-size: 0.9rem;
  font-weight: bold;
}

.event-item__duration {
  font-size: 0.75rem;
  color: #555;
  margin-top: 0.15rem;
}
</style>
