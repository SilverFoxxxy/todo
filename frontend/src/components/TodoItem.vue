<script setup>
import { ref, watch } from 'vue';
import { useTodoStore } from '../composables/useTodoStore';

const props = defineProps({
  todo: Object,
  date: String,
});

const store = useTodoStore();

const isEditing = ref(false);
const editedText = ref(props.todo.text);

// Для хранения предыдущего статуса (чтобы не потерять при выборе Delete)
const previousStatus = ref(props.todo.status);

function startEditing() {
  isEditing.value = true;
  editedText.value = props.todo.text;
}

function saveText() {
  if (editedText.value.trim()) {
    store.updateTodo(props.date, props.todo.id, {
      text: editedText.value.trim(),
    });
  } else {
    store.deleteTodo(props.date, props.todo.id);
  }
  isEditing.value = false;
}

function cancelEditing() {
  isEditing.value = false;
}

function handleStatusChange(e) {
  const newValue = e.target.value;
  if (newValue === '__delete__') {
    // Удаляем задачу и сбрасываем селект на предыдущий статус
    store.deleteTodo(props.date, props.todo.id);
    // Так как компонент исчезнет, можно не восстанавливать, но на всякий случай:
    e.target.value = previousStatus.value;
    return;
  }
  // Обычное изменение статуса
  store.updateTodo(props.date, props.todo.id, { status: newValue });
  previousStatus.value = newValue;
}

// Синхронизируем previousStatus при возможном внешнем изменении статуса
watch(
  () => props.todo.status,
  newVal => {
    previousStatus.value = newVal;
  }
);
</script>

<template>
  <div
    class="todo-item"
    :style="{
      '--status-color': `var(--color-${todo.status.toLowerCase().replace(' ', '-')})`,
    }"
  >
    <div
      v-if="!isEditing"
      class="todo-text"
      @dblclick="startEditing"
    >
      {{ todo.text }}
    </div>
    <input
      v-else
      v-model="editedText"
      @blur="saveText"
      @keyup.escape="cancelEditing"
      @keyup.enter="saveText"
      class="edit-input"
      autofocus
    />

    <select
      class="status-select"
      :value="todo.status"
      @change="handleStatusChange"
    >
      <option
        v-for="status in store.STATUSES"
        :key="status"
        :value="status"
      >
        {{ status }}
      </option>
      <optgroup label="──────────────"></optgroup>
      <option
        value="__delete__"
        class="delete-option"
      >
        🗑 Delete
      </option>
    </select>
  </div>
</template>

<style scoped>
/* Левая цветная полоса через переменную */
.todo-item {
  border-left: 4px solid color-mix(in srgb, var(--status-color) 30%, white);
  background: color-mix(in srgb, var(--status-color) 15%, white);
  padding: 6px 10px;
  margin-bottom: 8px;
  border-radius: 4px;
  display: flex;
  align-items: top;
  justify-content: space-between;
}

.todo-text {
  flex: 1;
  cursor: pointer;
  font-size: 0.9rem;
  word-break: break-word;
  text-align: left;
}

.edit-input {
  flex: 1;
  padding: 2px 6px;
  font-size: 0.9rem;
}

.status-select {
  flex-shrink: 0;
  margin-left: 8px;
  padding: 4px 6px;
  border-radius: 4px;
  border: 1px solid var(--status-color, #ccc);
  background-color: color-mix(in srgb, var(--status-color) 30%, white);
  /* background-color: var(--status-color, #eee); */
  color: #fff;
  font-size: 0.8rem;
  width: 1rem;
  height: 1.5rem;
  font-weight: 600;
  cursor: pointer;
  appearance: none; /* убираем стрелку в некоторых браузерах, можно заменить на кастомный */
  -webkit-appearance: none;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'><path fill='white' d='M6 8L1 3h10z'/></svg>");
  background-repeat: no-repeat;
  background-position: right 8px center;
  padding-right: 28px;
}

/* Для опции удаления можно оставить обычный цвет */
.delete-option {
  color: #333;
  background: #fff;
}

/* Цвет текста в селекте, чтобы читался на фоне */
.status-select option {
  background: #fff;
  color: #333;
}
</style>
