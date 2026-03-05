<script setup>
import { onMounted } from 'vue'
import { getAllPlugins } from '../plugins/index.js'
import PluginCard from '../components/PluginCard.vue'
import { useCalendar } from '../composables/useCalendar.js'

const plugins = getAllPlugins()
const { sources, addSource, removeSource, toggleSource, loadSources } = useCalendar()

onMounted(loadSources)
</script>

<template>
  <div class="config-view">
    <header class="config-header">
      <h1 class="config-title">⚙️ Configuration</h1>
      <p class="config-subtitle">Manage your calendar sources and connections.</p>
    </header>

    <section class="config-card">
      <h2 class="section-title">Add Calendar Source</h2>
      <p class="section-desc">
        Select a calendar provider and enter its connection details to add it to your merged calendar.
      </p>

      <div class="plugin-list">
        <PluginCard
          v-for="plugin in plugins"
          :key="plugin.id"
          :plugin="plugin"
          @add="addSource"
        />
      </div>
    </section>

    <section class="config-card">
      <h2 class="section-title">Configured Calendars</h2>

      <p v-if="sources.length === 0" class="empty-state">
        <span class="empty-icon">📅</span>
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
              class="toggle-btn"
              :class="source.enabled ? 'toggle-btn--on' : 'toggle-btn--off'"
              @click="toggleSource(source.id)"
              :aria-label="source.enabled ? 'Disable ' + source.label : 'Enable ' + source.label"
              :aria-pressed="source.enabled"
            >
              {{ source.enabled ? 'Enabled' : 'Disabled' }}
            </button>
            <button
              class="danger-btn"
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
  gap: 1.5rem;
  max-width: 720px;
  margin: 0 auto;
  padding: 1.5rem 0;
}

.config-header {
  padding-bottom: 0.5rem;
}

.config-title {
  font-size: 1.75rem;
  font-weight: 700;
  color: #1e293b;
  margin: 0 0 0.25rem;
  letter-spacing: -0.02em;
}

.config-subtitle {
  color: #64748b;
  margin: 0;
  font-size: 0.95rem;
}

.config-card {
  background: #fff;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08), 0 4px 16px rgba(0, 0, 0, 0.06);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.section-title {
  font-size: 1.05rem;
  font-weight: 600;
  color: #1e293b;
  margin: 0;
}

.section-desc {
  font-size: 0.875rem;
  color: #64748b;
  margin: 0;
  line-height: 1.6;
}

.plugin-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.empty-state {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #64748b;
  font-size: 0.9rem;
  padding: 1.5rem 0;
  justify-content: center;
}

.empty-icon {
  font-size: 1.25rem;
}

.source-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.source-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.875rem 1rem;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #f8fafc;
  transition: border-color 0.15s ease;
}

.source-item:hover {
  border-color: #cbd5e1;
}

.source-item--disabled {
  background: #f8fafc;
  opacity: 0.6;
}

.source-item__info {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
}

.source-item__label {
  font-weight: 600;
  font-size: 0.95rem;
  color: #1e293b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-item__plugin {
  font-size: 0.75rem;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.source-item__actions {
  display: flex;
  gap: 0.5rem;
  flex-shrink: 0;
}

.toggle-btn {
  padding: 0.375rem 0.875rem;
  border-radius: 6px;
  border: 1.5px solid transparent;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.toggle-btn--on {
  background: #dcfce7;
  color: #15803d;
  border-color: #bbf7d0;
}

.toggle-btn--on:hover {
  background: #bbf7d0;
}

.toggle-btn--off {
  background: #f1f5f9;
  color: #64748b;
  border-color: #e2e8f0;
}

.toggle-btn--off:hover {
  background: #e2e8f0;
}

.danger-btn {
  padding: 0.375rem 0.875rem;
  border-radius: 6px;
  border: 1.5px solid #fecaca;
  background: #fff1f2;
  color: #dc2626;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.danger-btn:hover {
  background: #fecaca;
  border-color: #fca5a5;
}
</style>

