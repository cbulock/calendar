<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const isCalendarRoute = computed(() => route.name === 'calendar')
</script>

<template>
  <div class="app" :class="{ 'eink-mode': isCalendarRoute }">
    <main class="app-main">
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.app-main {
  flex: 1;
  padding: 0.75rem;
  max-width: 900px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
}
</style>
