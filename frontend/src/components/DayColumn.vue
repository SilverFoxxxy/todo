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

const todayStr = new Date().toISOString().slice(0, 10);
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
      class="todos-list"
      ghost-class="ghost"
    >
      <template #item="{ element }">
        <TodoItem
          :todo="element"
          :date="date"
        />
      </template>
    </draggable>

    <div class="add-todo">
      <input
        v-model="newTodoText"
        @keyup.enter="addTodo"
        placeholder="Новое дело"
        class="todo-input"
      />
      <button
        @click="addTodo"
        class="add-btn"
      >
        +
      </button>
    </div>
  </div>
</template>

<style scoped>
.day-column {
  background: white;
  border-radius: 8px;
  padding: 12px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  min-height: 300px;
}
.day-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
  color: #333;
}
.todos-list {
  flex: 1;
  min-height: 40px; /* чтобы зона была доступна даже при отсутствии задач */
  margin-bottom: 12px;
}
.ghost {
  opacity: 0.5;
  background: #e2e8f0;
  border-radius: 4px;
}
.add-todo {
  display: flex;
  gap: 6px;
}
.todo-input {
  flex: 1;
  padding: 6px 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 0.9rem;
}
.add-btn {
  background: #4a90d9;
  color: white;
  border: none;
  font-size: 1.2rem;
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
}
.today {
  /* background: #eef5ff;
  outline: 4px solid #eef5ff;
  border: px solid #eef5ff;
  border-radius: 2px; */
  color: blue;
  font-weight: bold;
  /* box-shadow: 0 0 0 2px var(--color-planned); */
}
</style>
