<script setup>
import { computed } from 'vue'

const props = defineProps({
  year: {
    type: Number,
    required: true,
  },
  month: {
    type: Number, // 0-based (0 = January)
    required: true,
  },
  events: {
    type: Array,
    default: () => [],
  },
})

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const monthLabel = computed(() => {
  return new Date(props.year, props.month, 1).toLocaleString('default', {
    month: 'long',
    year: 'numeric',
  })
})

/**
 * Build a 6-row grid of day cells for the month.
 * Each cell: { date: Date|null, isCurrentMonth: boolean, events: [] }
 */
const grid = computed(() => {
  const firstDay = new Date(props.year, props.month, 1)
  const lastDay = new Date(props.year, props.month + 1, 0)
  const startOffset = firstDay.getDay() // 0=Sun

  const cells = []

  // Leading empty cells from previous month
  for (let i = 0; i < startOffset; i++) {
    const d = new Date(props.year, props.month, 1 - (startOffset - i))
    cells.push({ date: d, isCurrentMonth: false, events: [] })
  }

  // Days in this month
  for (let d = 1; d <= lastDay.getDate(); d++) {
    cells.push({
      date: new Date(props.year, props.month, d),
      isCurrentMonth: true,
      events: [],
    })
  }

  // Trailing cells to fill the last row
  const remaining = 42 - cells.length // 6 rows × 7 cols
  for (let i = 1; i <= remaining; i++) {
    cells.push({
      date: new Date(props.year, props.month + 1, i),
      isCurrentMonth: false,
      events: [],
    })
  }

  // Assign events to all day cells they span ([start, end) range overlap)
  for (const cell of cells) {
    if (!cell.date) continue
    const cellStart = new Date(
      cell.date.getFullYear(),
      cell.date.getMonth(),
      cell.date.getDate(),
    )
    const cellEnd = new Date(
      cell.date.getFullYear(),
      cell.date.getMonth(),
      cell.date.getDate() + 1,
    )
    cell.events = props.events.filter((e) => {
      const evtStart = new Date(e.start)
      const evtEnd = e.end ? new Date(e.end) : evtStart
      return evtStart < cellEnd && evtEnd > cellStart
    })
  }

  // Split into rows of 7
  const rows = []
  for (let i = 0; i < 42; i += 7) {
    rows.push(cells.slice(i, i + 7))
  }
  return rows
})

const today = new Date()

function isToday(date) {
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  )
}
</script>

<template>
  <div class="calendar-grid">
    <div class="month-label">{{ monthLabel }}</div>
    <div class="day-headers">
      <div v-for="day in DAYS" :key="day" class="day-header">{{ day }}</div>
    </div>
    <div class="grid-body">
      <div
        v-for="(row, rowIdx) in grid"
        :key="rowIdx"
        class="grid-row"
      >
        <div
          v-for="cell in row"
          :key="cell.date.toISOString()"
          class="day-cell"
          :class="{
            'day-cell--other-month': !cell.isCurrentMonth,
            'day-cell--today': cell.isCurrentMonth && isToday(cell.date),
            'day-cell--has-events': cell.events.length > 0,
          }"
          :aria-label="cell.date.toDateString()"
        >
          <span class="day-number">{{ cell.date.getDate() }}</span>
          <ul v-if="cell.events.length > 0" class="event-list">
            <li
              v-for="event in cell.events.slice(0, 3)"
              :key="event.id"
              class="event-chip"
              :title="event.title"
            >
              {{ event.title }}
            </li>
            <li v-if="cell.events.length > 3" class="event-more">
              +{{ cell.events.length - 3 }} more
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.calendar-grid {
  width: 100%;
  border: 1px solid #000;
}

.month-label {
  text-align: center;
  font-size: 1.1rem;
  font-weight: bold;
  padding: 0.4rem 0;
  border-bottom: 1px solid #000;
  background: #000;
  color: #fff;
  letter-spacing: 0.05em;
}

.day-headers {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  border-bottom: 1px solid #000;
}

.day-header {
  text-align: center;
  font-size: 0.75rem;
  font-weight: bold;
  padding: 0.25rem 0;
  border-right: 1px solid #000;
  letter-spacing: 0.04em;
}

.day-header:last-child {
  border-right: none;
}

.grid-body {
  display: flex;
  flex-direction: column;
}

.grid-row {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  border-bottom: 1px solid #000;
}

.grid-row:last-child {
  border-bottom: none;
}

.day-cell {
  min-height: 4rem;
  border-right: 1px solid #000;
  padding: 0.2rem;
  overflow: hidden;
}

.day-cell:last-child {
  border-right: none;
}

.day-cell--other-month .day-number {
  color: #888;
}

.day-cell--today .day-number {
  display: inline-block;
  background: #000;
  color: #fff;
  border-radius: 50%;
  width: 1.4em;
  height: 1.4em;
  line-height: 1.4em;
  text-align: center;
}

.day-number {
  font-size: 0.8rem;
  font-weight: bold;
  display: block;
  margin-bottom: 0.1rem;
}

.event-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.event-chip {
  font-size: 0.65rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  background: #222;
  color: #fff;
  border-radius: 2px;
  padding: 0 3px;
  margin-bottom: 1px;
  display: block;
}

.event-more {
  font-size: 0.6rem;
  color: #444;
}
</style>
