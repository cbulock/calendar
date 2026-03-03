<script setup>
import { ref } from 'vue'

const props = defineProps({
  plugin: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits(['add'])

const formValues = ref(
  Object.fromEntries(props.plugin.configFields.map((f) => [f.key, ''])),
)

const validationErrors = ref([])
const expanded = ref(false)

function toggleExpanded() {
  expanded.value = !expanded.value
  validationErrors.value = []
}

function handleAdd() {
  const result = props.plugin.validateConfig(formValues.value)
  if (!result.valid) {
    validationErrors.value = result.errors
    return
  }
  validationErrors.value = []
  emit('add', {
    pluginId: props.plugin.id,
    config: { ...formValues.value },
    label: formValues.value.calendarName || props.plugin.name,
  })
  // Reset form
  formValues.value = Object.fromEntries(props.plugin.configFields.map((f) => [f.key, '']))
  expanded.value = false
}
</script>

<template>
  <div class="plugin-card" :class="{ 'plugin-card--expanded': expanded }">
    <button class="plugin-card__header" @click="toggleExpanded" :aria-expanded="expanded">
      <span class="plugin-card__icon">{{ plugin.icon }}</span>
      <div class="plugin-card__header-text">
        <span class="plugin-card__name">{{ plugin.name }}</span>
        <span class="plugin-card__desc-inline">{{ plugin.description }}</span>
      </div>
      <span class="plugin-card__chevron" :class="{ 'plugin-card__chevron--open': expanded }">
        ›
      </span>
    </button>

    <div v-if="expanded" class="plugin-card__body">
      <div v-for="field in plugin.configFields" :key="field.key" class="form-field">
        <label :for="`${plugin.id}-${field.key}`" class="form-label">
          {{ field.label }}
          <span v-if="field.required" class="required-mark" aria-hidden="true">*</span>
        </label>
        <input
          :id="`${plugin.id}-${field.key}`"
          v-model="formValues[field.key]"
          :type="field.type || 'text'"
          :placeholder="field.placeholder || ''"
          :required="field.required"
          class="form-input"
        />
      </div>

      <ul v-if="validationErrors.length > 0" class="error-list" role="alert">
        <li v-for="(err, i) in validationErrors" :key="i">{{ err }}</li>
      </ul>

      <button class="add-btn" @click="handleAdd">Add Calendar</button>
    </div>
  </div>
</template>

<style scoped>
.plugin-card {
  border: 1.5px solid #e2e8f0;
  border-radius: 10px;
  overflow: hidden;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  background: #fff;
}

.plugin-card:hover {
  border-color: #a5b4fc;
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.08);
}

.plugin-card--expanded {
  border-color: #818cf8;
  box-shadow: 0 2px 12px rgba(99, 102, 241, 0.12);
}

.plugin-card__header {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.875rem 1rem;
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s ease;
}

.plugin-card__header:hover {
  background: #f8f7ff;
}

.plugin-card__icon {
  font-size: 1.4rem;
  line-height: 1;
  flex-shrink: 0;
}

.plugin-card__header-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.plugin-card__name {
  font-size: 0.95rem;
  font-weight: 600;
  color: #1e293b;
}

.plugin-card__desc-inline {
  font-size: 0.8rem;
  color: #94a3b8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plugin-card__chevron {
  font-size: 1.25rem;
  color: #94a3b8;
  transition: transform 0.2s ease;
  line-height: 1;
  display: inline-block;
  transform: rotate(0deg);
}

.plugin-card__chevron--open {
  transform: rotate(90deg);
}

.plugin-card__body {
  padding: 1rem 1rem 1.25rem;
  border-top: 1.5px solid #e2e8f0;
  background: #fafbff;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.form-label {
  font-size: 0.825rem;
  font-weight: 600;
  color: #374151;
}

.required-mark {
  color: #dc2626;
  margin-left: 2px;
}

.form-input {
  width: 100%;
  border: 1.5px solid #e2e8f0;
  border-radius: 7px;
  padding: 0.5rem 0.75rem;
  font-size: 0.9rem;
  font-family: inherit;
  background: #fff;
  color: #1e293b;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.form-input:focus {
  border-color: #818cf8;
  box-shadow: 0 0 0 3px rgba(129, 140, 248, 0.15);
  outline: none;
}

.form-input::placeholder {
  color: #cbd5e1;
}

.error-list {
  background: #fff1f2;
  border: 1.5px solid #fecaca;
  border-radius: 7px;
  padding: 0.6rem 0.75rem 0.6rem 1.5rem;
  font-size: 0.825rem;
  color: #dc2626;
  margin: 0;
}

.add-btn {
  align-self: flex-start;
  padding: 0.5rem 1.25rem;
  border-radius: 7px;
  border: none;
  background: #4f46e5;
  color: #fff;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.1s ease;
}

.add-btn:hover {
  background: #4338ca;
}

.add-btn:active {
  transform: scale(0.97);
}
</style>

