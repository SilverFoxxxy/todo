<script setup>
import { ref, computed } from 'vue';
import { useTodoStore } from '../composables/useTodoStore';
import TodoItem from './TodoItem.vue';
import draggable from 'vuedraggable';

const props = defineProps({
  date: String,
  dayName: String,
});

const store = useTodoStore();
const newTodoText = ref('');

const now = new Date();
const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
const isToday = computed(() => props.date === todayStr);

// Прямая ссылка на реактивный объект недели
const weekData = store.weekData; // это ref

function addTodo() {
  const text = newTodoText.value.trim();
  if (!text) return;
  store.addTodo(props.date, text);
  newTodoText.value = '';
}
</script>

<template>
  <div class="day-column">
    <div
      class="day-header"
      :class="{ today: isToday }"
    >
      <strong>{{ dayName }}</strong>
      <span>{{ date.slice(-2) }}.{{ date.slice(5, 7) }}</span>
    </div>

    <draggable
      v-model="weekData[date]"
      item-key="id"
      group="todos"
      class="item-list"
      ghost-class="ghost"
    >
      <template #item="{ element }">
        <TodoItem
          :todo="element"
          :date="date"
        />
      </template>
    </draggable>

    <div
      class="item-card add-todo-card"
      :style="{ '--status-color': 'var(--color-planned)' }"
    >
      <input
        v-model="newTodoText"
        placeholder="Новое дело"
        class="add-todo-input"
        @keyup.enter="addTodo"
      />
      <button
        class="add-btn item-button"
        @click="addTodo"
      >
        +
      </button>
    </div>
  </div>
</template>

<style scoped>
.day-column {
  min-height: 550px;
}
.today {
  color: blue;
  font-weight: bold;
}
@media (max-width: 600px) {
  .day-column {
    min-height: 350px;
  }
}
</style>
