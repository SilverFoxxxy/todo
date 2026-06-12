<script setup>
import { useTodoStore } from '../composables/useTodoStore';
import HabitsDayColumn from './HabitsDayColumn.vue';
import { getDayName } from '../utils/dateUtils';

const store = useTodoStore();
</script>

<template>
  <div>
    <div class="week-grid">
      <HabitsDayColumn
        v-for="date in store.weekDays.value"
        :key="date"
        :date="date"
        :day-name="getDayName(date)"
      />
    </div>
  </div>
</template>
