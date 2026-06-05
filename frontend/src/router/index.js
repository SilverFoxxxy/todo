import { createRouter, createWebHashHistory } from 'vue-router';
import WeekPage from '../pages/WeekPage.vue';
import YearPage from '../pages/YearPage.vue';

const routes = [
  { path: '/', name: 'week', component: WeekPage },
  { path: '/year', name: 'year', component: YearPage },
];

const router = createRouter({
  history: createWebHashHistory('/todo/'), // ← хеш-режим
  routes,
});

export default router;
