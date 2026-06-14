<script setup>
import { ref } from 'vue';
import { useTodoStore } from '../composables/useTodoStore';

const props = defineProps({ date: String });
const store = useTodoStore();
const habitName = ref('');

function addHabit() {
  const name = habitName.value.trim();
  if (!name) return;

  let def = store.habitDefs.value.find(
    d => d.name.toLowerCase() === name.toLowerCase()
  );

  // ВРЕМЕННЫЙ ID для значения (если определения нет)
  const tempId = def?.id || crypto.randomUUID();

  // СНАЧАЛА устанавливаем значение (с временным ID)
  store.setHabitValue(
    props.date,
    tempId,
    def?.type === 'boolean' ? true : def?.type === 'number' ? 0 : ''
  );

  habitName.value = '';

  // ПОТОМ создаём определение (если его не было)
  if (!def) {
    def = {
      id: tempId,
      name,
      type: 'boolean',
      color: '#999',
    };
    store.addHabitDef(def);
  }
}
</script>

<template>
  <div
    class="add-habit-card item-card"
    style="--status-color: #aaa"
  >
    <input
      v-model="habitName"
      list="habit-list"
      @keyup.enter="addHabit"
      placeholder="Новая привычка…"
      class="add-todo-input"
    />
    <datalist id="habit-list">
      <option
        v-for="def in store.habitDefs.value"
        :key="def.id"
        :value="def.name"
      />
    </datalist>
    <button
      @click="addHabit"
      class="add-btn item-button"
    >
      +
    </button>
  </div>
</template>

<style scoped>
.add-habit-card {
  margin-top: 4px;
}
</style>
