<script setup>
const props = defineProps({
  event: {
    type: Object,
    required: true,
  },
})

function formatTime(date) {
  if (!date) return ''
  const d = new Date(date)
  return d.toLocaleTimeString('default', { hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div class="event-item">
    <div class="event-item__time" v-if="!event.allDay">
      {{ formatTime(event.start) }}–{{ formatTime(event.end) }}
    </div>
    <div class="event-item__time event-item__time--allday" v-else>All day</div>
    <div class="event-item__title">{{ event.title }}</div>
    <div class="event-item__location" v-if="event.location">📍 {{ event.location }}</div>
    <div class="event-item__description" v-if="event.description">{{ event.description }}</div>
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

.event-item__location {
  font-size: 0.75rem;
  color: #555;
  margin-top: 0.15rem;
}

.event-item__description {
  font-size: 0.75rem;
  color: #333;
  margin-top: 0.15rem;
  white-space: pre-line;
}
</style>
