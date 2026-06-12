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
    class="item-card todo-item"
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
      class="item-button status-select"
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
.todo-item {
  justify-content: space-between;
}
.todo-text {
  flex: 1;
  cursor: pointer;
  font-size: 0.9rem;
  word-break: break-word;
  text-align: left;
}
.delete-option {
  color: #333;
  background: #fff;
}
.status-select option {
  background: #fff;
  color: #333;
}
</style>
