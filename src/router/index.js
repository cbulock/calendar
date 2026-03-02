import { createRouter, createWebHashHistory } from 'vue-router'
import CalendarView from '../views/CalendarView.vue'
import ConfigurationView from '../views/ConfigurationView.vue'

const routes = [
  {
    path: '/',
    redirect: '/calendar',
  },
  {
    path: '/calendar',
    name: 'calendar',
    component: CalendarView,
  },
  {
    path: '/config',
    name: 'config',
    component: ConfigurationView,
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

export default router
