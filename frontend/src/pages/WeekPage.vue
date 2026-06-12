<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
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

// Синхронизация скролла
const weekViewRef = ref(null);
const weekHabitsRef = ref(null);

function syncScroll(source, target) {
  if (source && target) {
    target.scrollLeft = source.scrollLeft;
  }
}

let scrollHandler1, scrollHandler2;

onMounted(() => {
  const el1 = weekViewRef.value?.$el || weekViewRef.value;
  const el2 = weekHabitsRef.value?.$el || weekHabitsRef.value;
  if (el1 && el2) {
    scrollHandler1 = () => syncScroll(el1, el2);
    scrollHandler2 = () => syncScroll(el2, el1);
    el1.addEventListener('scroll', scrollHandler1);
    el2.addEventListener('scroll', scrollHandler2);
  }
});

onUnmounted(() => {
  const el1 = weekViewRef.value?.$el || weekViewRef.value;
  const el2 = weekHabitsRef.value?.$el || weekHabitsRef.value;
  if (el1) el1.removeEventListener('scroll', scrollHandler1);
  if (el2) el2.removeEventListener('scroll', scrollHandler2);
});
</script>

<template>
  <div class="week-page">
    <div class="week-controls">
      <button
        @click="store.shiftWeek(-1)"
        class="nav-btn"
      >
        ←
      </button>
      <span class="week-label">{{ weekLabel }}</span>
      <button
        @click="store.shiftWeek(1)"
        class="nav-btn"
      >
        →
      </button>
    </div>

    <WeekView ref="weekViewRef" />
    <WeekStats />

    <h2>Мониторинг привычек</h2>
    <WeekHabits ref="weekHabitsRef" />
    <button
      @click="showHabitEditor = true"
      class="nav-btn"
      style="font-size: 0.9rem"
    >
      Настроить
    </button>

    <HabitEditor
      v-if="showHabitEditor"
      @close="showHabitEditor = false"
    />
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
