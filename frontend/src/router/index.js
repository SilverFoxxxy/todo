import { createRouter, createWebHistory } from 'vue-router';
import WeekPage from '../pages/WeekPage.vue';
import YearPage from '../pages/YearPage.vue';

const routes = [
  { path: '/', name: 'week', component: WeekPage },
  { path: '/year', name: 'year', component: YearPage },
];

const router = createRouter({
  history: createWebHistory('/todo/'), // соответствует base в vite.config.js
  routes,
});

export default router;
