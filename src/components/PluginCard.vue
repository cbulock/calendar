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
  <div class="plugin-card">
    <button class="plugin-card__header" @click="toggleExpanded" :aria-expanded="expanded">
      <span class="plugin-card__icon">{{ plugin.icon }}</span>
      <span class="plugin-card__name">{{ plugin.name }}</span>
      <span class="plugin-card__toggle">{{ expanded ? '▲' : '▼' }}</span>
    </button>

    <div v-if="expanded" class="plugin-card__body">
      <p class="plugin-card__desc">{{ plugin.description }}</p>

      <div v-for="field in plugin.configFields" :key="field.key" class="form-field">
        <label :for="`${plugin.id}-${field.key}`" class="form-label">
          {{ field.label }}
          <span v-if="field.required" aria-hidden="true">*</span>
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

      <button class="btn btn--primary" @click="handleAdd">Add Calendar</button>
    </div>
  </div>
</template>

<style scoped>
.plugin-card {
  border: 1px solid #000;
  margin-bottom: 0.75rem;
}

.plugin-card__header {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: #000;
  color: #fff;
  border: none;
  cursor: pointer;
  font-size: 0.95rem;
  font-weight: bold;
  text-align: left;
}

.plugin-card__icon {
  font-size: 1.1rem;
}

.plugin-card__name {
  flex: 1;
}

.plugin-card__toggle {
  font-size: 0.75rem;
}

.plugin-card__body {
  padding: 0.75rem;
  background: #fff;
}

.plugin-card__desc {
  font-size: 0.8rem;
  color: #444;
  margin: 0 0 0.75rem;
}

.form-field {
  margin-bottom: 0.6rem;
}

.form-label {
  display: block;
  font-size: 0.8rem;
  font-weight: bold;
  margin-bottom: 0.2rem;
}

.form-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #000;
  padding: 0.3rem 0.4rem;
  font-size: 0.85rem;
  font-family: inherit;
  background: #fff;
  color: #000;
}

.form-input:focus {
  outline: 2px solid #000;
  outline-offset: 1px;
}

.error-list {
  background: #eee;
  border: 1px solid #000;
  padding: 0.4rem 0.4rem 0.4rem 1.2rem;
  font-size: 0.8rem;
  margin: 0.4rem 0;
}

.btn {
  padding: 0.4rem 1rem;
  border: 2px solid #000;
  cursor: pointer;
  font-size: 0.85rem;
  font-family: inherit;
  font-weight: bold;
}

.btn--primary {
  background: #000;
  color: #fff;
}

.btn--primary:hover {
  background: #333;
}
</style>
