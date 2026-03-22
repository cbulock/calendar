<script setup>
import dayjs from 'dayjs'
import { useTimezone } from '../composables/useTimezone.js'

const props = defineProps({
  event: {
    type: Object,
    required: true,
  },
  past: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['select'])

const { timezone } = useTimezone()

function formatTime(date) {
  if (!date) return ''
  const d = new Date(date)
  // Floating-time events have no timezone attached — their stored UTC value IS
  // the wall-clock time (e.g. "09:00 UTC" means "9 AM wherever you are").
  // Display them using UTC so the hours/minutes are shown as-is, without any
  // offset conversion.
  const tz = props.event.floating ? 'UTC' : timezone.value
  return d.toLocaleTimeString('default', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: tz,
  })
}

function formatDuration(start, end) {
  if (!start || !end) return ''
  const ms = dayjs(end).diff(dayjs(start), 'millisecond')
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
  <div
    class="event-item"
    :class="{
      'event-item--tentative': event.status === 'TENTATIVE',
      'event-item--past': past,
    }"
    role="button"
    tabindex="0"
    @click="emit('select', event)"
    @keydown.enter="emit('select', event)"
    @keydown.space.prevent="emit('select', event)"
  >
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
  cursor: pointer;
}

.event-item:hover {
  background: #f5f5f5;
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

.event-item--tentative {
  border-style: dashed;
}

.event-item--tentative .event-item__title {
  font-style: italic;
}

.event-item--past {
  opacity: 0.45;
}
</style>
