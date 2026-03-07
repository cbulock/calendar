<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const isCalendarRoute = computed(() => route.name === 'calendar')

const darkMode = ref(false)

onMounted(() => {
  darkMode.value = localStorage.getItem('calendar_dark_mode') === 'true'
})

function toggleDarkMode() {
  darkMode.value = !darkMode.value
  localStorage.setItem('calendar_dark_mode', String(darkMode.value))
}
</script>

<template>
  <div class="app" :class="{ 'eink-mode': isCalendarRoute, 'dark-mode': darkMode }">
    <nav class="app-nav">
      <router-link class="nav-link" :to="{ name: 'calendar' }">Monthly</router-link>
      <router-link class="nav-link" :to="{ name: 'week' }">Week</router-link>
      <router-link class="nav-link" :to="{ name: 'day' }">Day</router-link>
      <router-link class="nav-link nav-link--config" :to="{ name: 'config' }">⚙ Config</router-link>
      <button
        class="nav-link dark-toggle"
        @click="toggleDarkMode"
        :aria-label="darkMode ? 'Switch to light mode' : 'Switch to dark mode'"
        :title="darkMode ? 'Light mode' : 'Dark mode'"
      >{{ darkMode ? '☀' : '☾' }}</button>
    </nav>
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

.app-nav {
  display: flex;
  gap: 0;
  border-bottom: 2px solid #000;
  background: #000;
}

.nav-link {
  padding: 0.45rem 1rem;
  font-size: 0.85rem;
  font-weight: bold;
  color: #ccc;
  text-decoration: none;
  letter-spacing: 0.04em;
}

.nav-link:hover {
  color: #fff;
  background: #222;
}

.nav-link.router-link-exact-active {
  color: #fff;
  background: #333;
}

.nav-link--config {
  margin-left: auto;
}

.dark-toggle {
  background: transparent;
  border: none;
  font-size: 1rem;
  padding: 0.45rem 0.75rem;
  margin-left: 0;
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
