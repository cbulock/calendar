import { createRouter, createWebHashHistory } from 'vue-router'
import CalendarView from '../views/CalendarView.vue'
import ConfigurationView from '../views/ConfigurationView.vue'
import DayView from '../views/DayView.vue'
import WeekView from '../views/WeekView.vue'

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
    path: '/week',
    name: 'week',
    component: WeekView,
  },
  {
    path: '/day',
    name: 'day',
    component: DayView,
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
