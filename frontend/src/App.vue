<script setup>
import { ref } from 'vue';
import { useTodoStore } from './composables/useTodoStore';

const store = useTodoStore();
const fileInput = ref(null);

function clearAllData() {
  if (
    confirm(
      'Вы уверены, что хотите удалить ВСЕ задачи? Это действие необратимо.'
    )
  ) {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith('todo-week-')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
    localStorage.removeItem('todo-status-order'); // сбросим и порядок статусов
    alert('Данные удалены. Страница перезагрузится.');
    location.reload();
  }
}

function importJSON(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const imported = JSON.parse(e.target.result);
      for (const [dateStr, tasks] of Object.entries(imported)) {
        if (!Array.isArray(tasks)) continue;
        // Определяем понедельник этой даты (та же логика, что в store)
        const d = new Date(dateStr);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(d.setDate(diff));
        const key = `todo-week-${monday.getFullYear()}-W${String(getISOWeekNumber(monday)).padStart(2, '0')}`;

        // Загружаем существующую неделю (или создаём)
        let week = {};
        const existing = localStorage.getItem(key);
        if (existing) {
          try {
            week = JSON.parse(existing);
          } catch (e) {}
        }
        if (!week[dateStr]) week[dateStr] = [];

        // Добавляем задачи, генерируя ID если нет
        tasks.forEach(task => {
          if (!task.id) task.id = crypto.randomUUID();
          week[dateStr].push(task);
        });

        localStorage.setItem(key, JSON.stringify(week));
      }
      alert('Импорт завершён! Обновите страницу, чтобы увидеть изменения.');
      // или вызовите store.loadWeek(store.currentMonday.value) чтобы не обновлять
    } catch (err) {
      alert('Ошибка: ' + err.message);
    }
  };
  reader.readAsText(file);
}

// Вспомогательная функция ISO‑номера недели (из store)
function getISOWeekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
}
</script>

<template>
  <div class="app">
    <h1>Weekly To‑Do</h1>
    <nav class="main-nav">
      <router-link to="/">Неделя</router-link>
      <router-link to="/year">Год</router-link>
    </nav>
    <router-view />
  </div>

  <div style="text-align: center; margin: 10px 0">
    <input
      type="file"
      accept=".json"
      @change="importJSON"
    />
    <span style="font-size: 0.8rem; color: #666"> (импорт JSON)</span>
  </div>
  <!--
  <div style="text-align: center; margin: 10px 0">
    <button
      @click="clearAllData"
      class="danger-btn"
    >
      🗑 Сбросить все данные
    </button>
  </div> -->
</template>

<style>
/* Глобальные стили можно оставить здесь или в main.css */
body {
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  margin: 0;
  padding: 20px;
  background: #f5f5f5;
}
.app {
  /* max-width: 1200px; */
  margin: 0 auto;
}
h1 {
  text-align: center;
  color: #333;
}
</style>

<style scoped>
.main-nav {
  display: flex;
  justify-content: center;
  gap: 24px;
  margin-bottom: 20px;
}
.main-nav a {
  text-decoration: none;
  color: #4a90d9;
  font-weight: 600;
  padding: 6px 16px;
  border-radius: 6px;
  transition: background 0.2s;
}
.main-nav a.router-link-active {
  background: #4a90d9;
  color: #fff;
}
</style>
