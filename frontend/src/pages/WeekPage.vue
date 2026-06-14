<script setup>
import { ref, computed } from 'vue';
import { useTodoStore } from '../composables/useTodoStore';
import WeekView from '../components/WeekView.vue';
import WeekStats from '../components/WeekStats.vue';
import WeekHabits from '../components/WeekHabits.vue';
import HabitEditor from '../components/HabitEditor.vue';

const showHabitEditor = ref(false);

const store = useTodoStore();

function formatDateHeader(dateStr) {
  const d = new Date(dateStr);
  return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}`;
}

const weekLabel = computed(() => {
  const start = store.weekDays.value[0];
  const end = store.weekDays.value[6];
  return `${formatDateHeader(start)} – ${formatDateHeader(end)}`;
});
</script>

<template>
  <div class="week-page">
    <div class="week-controls">
      <button
        class="nav-btn"
        @click="store.shiftWeek(-1)"
      >
        ←
      </button>
      <span class="week-label">{{ weekLabel }}</span>
      <button
        class="nav-btn"
        @click="store.shiftWeek(1)"
      >
        →
      </button>
    </div>

    <div class="week-scroll-wrapper">
      <WeekView ref="weekViewRef" />
      <h2>Мониторинг привычек</h2>
      <WeekHabits ref="weekHabitsRef" />
    </div>

    <button
      class="nav-btn"
      style="font-size: 0.9rem; margin: 15px 0"
      @click="showHabitEditor = true"
    >
      Настроить
    </button>

    <HabitEditor
      v-if="showHabitEditor"
      @close="showHabitEditor = false"
    />
    <WeekStats />
  </div>
</template>

<style scoped>
.week-page {
  margin: 0 auto;
}
.week-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-bottom: 20px;
}
.nav-btn {
  background: #4a90d9;
  color: white;
  border: none;
  font-size: 1.2rem;
  padding: 6px 16px;
  border-radius: 6px;
  cursor: pointer;
}
.nav-btn:hover {
  background: #357abd;
}
.week-label {
  font-size: 1.1rem;
  font-weight: 600;
}
</style>
