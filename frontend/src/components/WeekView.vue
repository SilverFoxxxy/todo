<script setup>
import { useTodoStore } from '../composables/useTodoStore';
import DayColumn from './DayColumn.vue';

const store = useTodoStore();

const dayNames = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'];

function formatDateHeader(dateStr) {
  const d = new Date(dateStr);
  return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}`;
}

function weekLabel() {
  const start = store.weekDays.value[0];
  const end = store.weekDays.value[6];
  return `${formatDateHeader(start)} – ${formatDateHeader(end)}`;
}
</script>

<template>
  <div class="week-controls">
    <button
      @click="store.shiftWeek(-1)"
      class="nav-btn"
    >
      ←
    </button>
    <span class="week-label">{{ weekLabel() }}</span>
    <button
      @click="store.shiftWeek(1)"
      class="nav-btn"
    >
      →
    </button>
  </div>

  <div class="week-grid">
    <DayColumn
      v-for="(date, index) in store.weekDays.value"
      :key="date"
      :date="date"
      :day-name="dayNames[index]"
    />
  </div>
</template>

<style scoped>
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
.week-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 12px;
  overflow-x: scroll;
}

@media (max-width: 600px) {
  .week-grid {
    gap: 0.5rem;
  }
}
</style>
