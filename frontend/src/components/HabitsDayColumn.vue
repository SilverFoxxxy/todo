<script setup>
import { ref, computed } from 'vue';
import { useTodoStore } from '../composables/useTodoStore';
import { getWeekKey } from '../utils/dateUtils';
import draggable from 'vuedraggable';
import HabitItem from './HabitItem.vue';
import AddHabit from './AddHabit.vue';

const props = defineProps({ date: String, dayName: String });
const store = useTodoStore();

const habitsList = computed({
  get: () => store.weekData.value?._habits?.[props.date] || [],
  set: val => {
    store.weekData.value._habits[props.date] = val;
    store.markWeekDirty(getWeekKey(new Date(props.date)));
    store.enqueueFile(getWeekKey(new Date(props.date)));
  },
});
</script>

<template>
  <div class="day-column">
    <div class="day-header">
      <strong>{{ dayName }}</strong>
      <span>{{ date.slice(-2) }}.{{ date.slice(5, 7) }}</span>
    </div>

    <draggable
      v-model="habitsList"
      item-key="habitId"
      group="habits"
      class="item-list"
      ghost-class="ghost"
    >
      <template #item="{ element }">
        <HabitItem
          :habitEntry="element"
          :date="date"
        />
      </template>
    </draggable>

    <AddHabit :date="date" />
  </div>
</template>

<style scoped>
.day-column {
  min-height: 150px;
}
</style>
