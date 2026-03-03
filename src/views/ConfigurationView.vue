<script setup>
import { getAllPlugins } from '../plugins/index.js'
import PluginCard from '../components/PluginCard.vue'
import { useCalendar } from '../composables/useCalendar.js'

const plugins = getAllPlugins()
const { sources, addSource, removeSource, toggleSource } = useCalendar()
</script>

<template>
  <div class="config-view">
    <h1 class="config-view__title">Configuration</h1>

    <section class="config-section">
      <h2 class="config-section__title">Add Calendar Source</h2>
      <p class="config-section__desc">
        Select a calendar provider and enter its connection details to add it to your merged calendar.
      </p>

      <PluginCard
        v-for="plugin in plugins"
        :key="plugin.id"
        :plugin="plugin"
        @add="addSource"
      />
    </section>

    <section class="config-section">
      <h2 class="config-section__title">Configured Calendars</h2>

      <p v-if="sources.length === 0" class="config-empty">
        No calendars added yet. Add one above.
      </p>

      <ul v-else class="source-list">
        <li
          v-for="source in sources"
          :key="source.id"
          class="source-item"
          :class="{ 'source-item--disabled': !source.enabled }"
        >
          <div class="source-item__info">
            <span class="source-item__label">{{ source.label }}</span>
            <span class="source-item__plugin">{{ source.pluginId }}</span>
          </div>
          <div class="source-item__actions">
            <button
              class="btn"
              :class="source.enabled ? 'btn--active' : 'btn--inactive'"
              @click="toggleSource(source.id)"
              :aria-label="source.enabled ? 'Disable ' + source.label : 'Enable ' + source.label"
              :aria-pressed="source.enabled"
            >
              {{ source.enabled ? 'Enabled' : 'Disabled' }}
            </button>
            <button
              class="btn btn--danger"
              @click="removeSource(source.id)"
              :aria-label="'Remove ' + source.label"
            >
              Remove
            </button>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.config-view {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.config-view__title {
  font-size: 1.3rem;
  font-weight: bold;
  margin: 0;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid #000;
}

.config-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.config-section__title {
  font-size: 1rem;
  font-weight: bold;
  margin: 0;
  padding-bottom: 0.25rem;
  border-bottom: 1px solid #000;
}

.config-section__desc {
  font-size: 0.8rem;
  color: #444;
  margin: 0;
}

.config-empty {
  font-size: 0.85rem;
  color: #555;
}

.source-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.source-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.4rem 0.6rem;
  border: 1px solid #000;
  background: #fff;
}

.source-item--disabled {
  background: #f0f0f0;
  color: #888;
}

.source-item__info {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 0;
}

.source-item__label {
  font-weight: bold;
  font-size: 0.9rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-item__plugin {
  font-size: 0.7rem;
  color: #666;
}

.source-item__actions {
  display: flex;
  gap: 0.4rem;
  flex-shrink: 0;
}

.btn {
  padding: 0.25rem 0.6rem;
  border: 1px solid #000;
  background: #fff;
  color: #000;
  cursor: pointer;
  font-size: 0.78rem;
  font-family: inherit;
  font-weight: bold;
}

.btn--active {
  background: #000;
  color: #fff;
}

.btn--inactive {
  background: #fff;
  color: #000;
  border-style: dashed;
}

.btn--danger {
  border-color: #000;
}

.btn--danger:hover {
  background: #000;
  color: #fff;
}
</style>
