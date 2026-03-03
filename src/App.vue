<script setup>
import { useRoute } from 'vue-router'
const route = useRoute()
</script>

<template>
  <div class="app">
    <nav class="app-nav" aria-label="Main navigation">
      <router-link to="/calendar" class="nav-link" :class="{ 'nav-link--active': route.name === 'calendar' }">
        📅 Calendar
      </router-link>
      <router-link to="/config" class="nav-link" :class="{ 'nav-link--active': route.name === 'config' }">
        ⚙️ Configuration
      </router-link>
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
  border-bottom: 2px solid #000;
  background: #fff;
}

.nav-link {
  padding: 0.5rem 1rem;
  text-decoration: none;
  color: #000;
  font-weight: bold;
  font-size: 0.9rem;
  border-right: 1px solid #000;
}

.nav-link:last-child {
  border-right: none;
}

.nav-link--active {
  background: #000;
  color: #fff;
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
