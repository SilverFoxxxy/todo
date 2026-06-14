<script setup>
import { ref, onMounted } from 'vue';
import { useTodoStore } from './composables/useTodoStore';
import { isSignedIn } from './composables/useGoogleDrive';

const store = useTodoStore();
const loginError = ref('');

// === Google Auth ===
async function handleLogin() {
  try {
    await store.enableCloudSync();
    loginError.value = '';
  } catch (e) {
    loginError.value = 'Ошибка входа: ' + e.message;
  }
}

function handleLogout() {
  store.disableCloudSync();
}

onMounted(() => {
  store.initCloudSync();
});

// === Импорт JSON ===
function importJSON(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const imported = JSON.parse(e.target.result);
      for (const [dateStr, tasks] of Object.entries(imported)) {
        if (!Array.isArray(tasks)) continue;
        const d = new Date(dateStr);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(d.setDate(diff));
        const key = `todo-week-${monday.getFullYear()}-W${String(getISOWeekNumber(monday)).padStart(2, '0')}`;

        let week = {};
        const existing = localStorage.getItem(key);
        if (existing) {
          try {
            week = JSON.parse(existing);
          } catch (e) {
            console.error('import json parse error:', e);
          }
        }
        if (!week[dateStr]) week[dateStr] = [];

        tasks.forEach(task => {
          if (!task.id) task.id = crypto.randomUUID();
          week[dateStr].push(task);
        });

        localStorage.setItem(key, JSON.stringify(week));
      }
      alert('Импорт завершён! Обновите страницу, чтобы увидеть изменения.');
    } catch (err) {
      alert('Ошибка: ' + err.message);
    }
  };
  reader.readAsText(file);
}

// === Сброс данных ===
function clearAllData() {
  if (
    confirm(
      'Вы уверены, что хотите удалить ВСЕ задачи и данные синхронизации? Это действие необратимо.'
    )
  ) {
    // Удаляем все ключи, начинающиеся с 'todo-'
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith('todo-')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));

    // Удаляем все ключи, начинающиеся с 'todo-', 'cloud-snap-', 'habits-definitions'
    Object.keys(localStorage)
      .filter(
        k =>
          k.startsWith('todo-') ||
          k.startsWith('cloud-snap-') ||
          k === 'habits-definitions'
      )
      .forEach(k => localStorage.removeItem(k));

    // Удаляем также данные авторизации Google (опционально)
    localStorage.removeItem('google_token');
    localStorage.removeItem('google_token_expires');
    localStorage.removeItem('google_token_scope');

    alert('Данные удалены. Страница перезагрузится.');
    location.reload();
  }
}

function getISOWeekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
}
</script>

<template>
  <header class="app-header">
    <div class="header-inner">
      <h3>To‑Do</h3>

      <!-- 🔐 Авторизация Google -->
      <div class="auth-area">
        <template v-if="!isSignedIn">
          <button
            class="google-btn"
            @click="handleLogin"
          >
            Войти через Google
          </button>
        </template>
        <template v-else>
          <span
            v-if="store.isInSync.value"
            class="sync-status"
            >✅ In Sync</span
          >
          <span
            v-else
            class="sync-status"
          >
            ⏳ ({{ store.syncProgress.value }}%)
          </span>
          <button
            class="logout-btn"
            @click="handleLogout"
          >
            Выйти
          </button>
        </template>
        <div
          v-if="loginError"
          class="error"
        >
          {{ loginError }}
        </div>
      </div>
    </div>
  </header>

  <div class="app">
    <!-- Навигация -->
    <nav class="main-nav">
      <router-link to="/">Неделя</router-link>
      <router-link to="/year">Год</router-link>
    </nav>

    <!-- Основной контент -->
    <router-view />

    <!-- Импорт/экспорт и сброс -->
    <div style="text-align: center; margin: 10px 0">
      <input
        type="file"
        accept=".json"
        @change="importJSON"
      />
      <span style="font-size: 0.8rem; color: #666"> (импорт JSON)</span>
    </div>
    <div style="text-align: center; margin: 10px 0">
      <button
        class="danger-btn"
        @click="clearAllData"
      >
        🗑 Сбросить все данные
      </button>
    </div>
  </div>
</template>

<style>
body {
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  margin: 0;
  padding: 20px;
  background: #f5f5f5;
}

/* Шапка на всю ширину */
.app-header {
  width: 100%;
  /* background: #fff; */
  border-radius: 8px;
  padding: 10px 0;
  /* box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1); */
  margin-bottom: 16px;
}

.header-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  align-content: bottom;
  flex-wrap: wrap;
  gap: 10px;
}

.app {
  margin: 0 auto;
  max-width: 1900px;
}
h1 {
  text-align: center;
  color: #333;
}

@media (max-width: 600px) {
  body {
    padding: 10px;
  }
  .week-grid {
    /* grid-template-columns: 1fr; одна колонка на мобиле */
    gap: 2px;
  }
  .day-column {
    min-width: 180px;
    min-height: auto;
    padding: 8px;
  }
  .todo-input {
    font-size: 0.8rem;
  }
  .add-btn {
    padding: 2px 8px;
    font-size: 1rem;
  }
  .nav-btn {
    font-size: 1rem;
    padding: 4px 12px;
  }
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

.auth-area {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  width: 10rem;
}
.google-btn {
  background: #fff;
  border: 1px solid #ccc;
  padding: 6px 14px;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 600;
}
.logout-btn {
  background: none;
  border: 1px solid #aaa;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
}
.sync-status {
  font-size: 0.85rem;
  color: #555;
}
.error {
  color: red;
  font-size: 0.85rem;
}
.danger-btn {
  background: #e74c3c;
  color: white;
  border: none;
  padding: 6px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
}
.danger-btn:hover {
  background: #c0392b;
}
</style>
