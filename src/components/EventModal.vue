<script setup>
import { onMounted, onUnmounted } from 'vue'
import dayjs from 'dayjs'
import { useTimezone } from '../composables/useTimezone.js'

const props = defineProps({
  event: {
    type: Object,
    required: true,
  },
  sourceLabel: {
    type: String,
    default: '',
  },
  timezone: {
    type: String,
    default: 'UTC',
  },
})

const emit = defineEmits(['close'])

function formatDate(date) {
  if (!date) return ''
  return new Date(date).toLocaleDateString('default', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: props.timezone,
  })
}

function formatTime(date) {
  if (!date) return ''
  return new Date(date).toLocaleTimeString('default', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: props.timezone,
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

function onKeydown(e) {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <teleport to="body">
    <div class="modal-backdrop" @click.self="emit('close')" role="dialog" aria-modal="true" :aria-label="event.title">
      <div class="modal-panel">
        <button class="modal-close" @click="emit('close')" aria-label="Close event details">✕</button>

        <h2 class="modal-title" :class="{ 'modal-title--tentative': event.status === 'TENTATIVE' }">
          {{ event.title }}
        </h2>

        <div class="modal-badge" v-if="event.status === 'TENTATIVE'">Tentative</div>

        <dl class="modal-details">
          <template v-if="event.allDay">
            <dt>Date</dt>
            <dd>{{ formatDate(event.start) }}</dd>
          </template>
          <template v-else>
            <dt>Date</dt>
            <dd>{{ formatDate(event.start) }}</dd>
            <dt>Time</dt>
            <dd>
              {{ formatTime(event.start) }}
              <span v-if="event.end"> – {{ formatTime(event.end) }}</span>
            </dd>
            <dt v-if="formatDuration(event.start, event.end)">Duration</dt>
            <dd v-if="formatDuration(event.start, event.end)">{{ formatDuration(event.start, event.end) }}</dd>
          </template>

          <template v-if="event.location">
            <dt>Location</dt>
            <dd>{{ event.location }}</dd>
          </template>

          <template v-if="event.description">
            <dt>Description</dt>
            <dd class="modal-description">{{ event.description }}</dd>
          </template>

          <template v-if="sourceLabel">
            <dt>Calendar</dt>
            <dd>{{ sourceLabel }}</dd>
          </template>
        </dl>
      </div>
    </div>
  </teleport>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.modal-panel {
  background: #fff;
  border: 2px solid #000;
  padding: 1.5rem;
  max-width: 480px;
  width: 100%;
  position: relative;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-close {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  background: none;
  border: none;
  font-size: 1.1rem;
  cursor: pointer;
  padding: 0.25rem 0.4rem;
  line-height: 1;
}

.modal-close:hover {
  background: #eee;
}

.modal-title {
  font-size: 1.2rem;
  font-weight: bold;
  margin: 0 2rem 0.75rem 0;
  line-height: 1.3;
}

.modal-title--tentative {
  font-style: italic;
}

.modal-badge {
  display: inline-block;
  font-size: 0.7rem;
  font-weight: bold;
  border: 1px dashed #000;
  padding: 0.1rem 0.4rem;
  margin-bottom: 0.75rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.modal-details {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.35rem 1rem;
  margin: 0;
}

.modal-details dt {
  font-weight: bold;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #555;
  padding-top: 0.1rem;
}

.modal-details dd {
  margin: 0;
  font-size: 0.9rem;
  color: #111;
}

.modal-description {
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
