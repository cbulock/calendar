<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const isCalendarRoute = computed(() => route.name === 'calendar')
</script>

<template>
  <div class="app" :class="{ 'eink-mode': isCalendarRoute }">
    <nav class="app-nav">
      <router-link class="nav-link" :to="{ name: 'calendar' }">Monthly</router-link>
      <router-link class="nav-link" :to="{ name: 'day' }">Day</router-link>
      <router-link class="nav-link nav-link--config" :to="{ name: 'config' }">⚙ Config</router-link>
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

.app-main {
  flex: 1;
  padding: 0.75rem;
  max-width: 900px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
}
</style>
