<script setup>
import { ref, computed } from 'vue';
import { useTodoStore } from '../composables/useTodoStore';

const props = defineProps({ habitEntry: Object, date: String });
const store = useTodoStore();

const def = computed(() =>
  store.habitDefs.value.find(d => d.id === props.habitEntry.habitId)
);

const isEditingName = ref(false);
const editedName = ref('');

function startEditingName() {
  editedName.value = def.value?.name || '';
  isEditingName.value = true;
}

function saveName() {
  const newName = editedName.value.trim();
  if (!newName || !def.value) {
    isEditingName.value = false;
    return;
  }

  // Если имя не изменилось, просто закрываем редактирование
  if (newName === def.value.name) {
    isEditingName.value = false;
    return;
  }

  // Ищем подходящее определение с таким же именем и типом
  const existingDef = store.habitDefs.value.find(
    d =>
      d.name.toLowerCase() === newName.toLowerCase() &&
      d.type === def.value.type
  );

  const newDefId = existingDef?.id || crypto.randomUUID();
  if (!existingDef) {
    store.addHabitDef({
      ...def.value,
      id: newDefId,
      name: newName,
    });
  }

  // Заменяем старую привычку на новую (или существующую)
  store.setHabitValue(props.date, def.value.id, null);
  store.setHabitValue(props.date, newDefId, props.habitEntry.value);
  isEditingName.value = false;
}

function cancelEditingName() {
  isEditingName.value = false;
}

function updateValue(val) {
  store.setHabitValue(props.date, props.habitEntry.habitId, val);
}

function handleAction(action) {
  if (action === '__delete__') {
    store.setHabitValue(props.date, props.habitEntry.habitId, null);
    return;
  }

  if (!def.value) return;
  const newType = action;

  // Ищем определение с таким же именем и новым типом
  const existingDef = store.habitDefs.value.find(
    d =>
      d.name.toLowerCase() === def.value.name.toLowerCase() &&
      d.type === newType
  );

  const newDefId = existingDef?.id || crypto.randomUUID();
  if (!existingDef) {
    store.addHabitDef({
      ...def.value,
      id: newDefId,
      type: newType,
    });
  }

  store.setHabitValue(props.date, def.value.id, null);
  store.setHabitValue(props.date, newDefId, props.habitEntry.value);
}
</script>

<template>
  <div
    class="habit-item item-card-habit item-card"
    :style="{ '--status-color': def?.color || '#ccc' }"
  >
    <div class="habit-main">
      <span
        v-if="!isEditingName"
        class="habit-name"
        @dblclick="startEditingName"
      >
        {{ def?.name || '???' }}
      </span>
      <input
        v-else
        v-model="editedName"
        @blur="saveName"
        @keyup.escape="cancelEditingName"
        @keyup.enter="saveName"
        class="edit-input edit-name-input"
        autofocus
      />

      <select
        class="habit-actions"
        @change="handleAction($event.target.value)"
      >
        <option value="">⚙️</option>
        <option value="boolean">Да/Нет</option>
        <option value="number">Число</option>
        <option value="time">Время</option>
        <option value="__delete__">🗑 Удалить</option>
      </select>
    </div>

    <input
      v-if="def?.type === 'number'"
      type="number"
      :value="habitEntry.value"
      @input="updateValue($event.target.value)"
      class="habit-value-input"
      placeholder="0"
    />
    <input
      v-else-if="def?.type === 'time'"
      type="time"
      :value="habitEntry.value"
      @input="updateValue($event.target.value)"
      class="habit-value-input"
    />
  </div>
</template>

<style scoped>
.habit-item {
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  margin-bottom: 8px;
  border-left: 4px solid
    color-mix(in srgb, var(--status-color, #ccc) 60%, white);
  background: color-mix(in srgb, var(--status-color, #ccc) 30%, white);
}
.habit-main {
  display: flex;
  align-items: center;
  gap: 6px;
}
.habit-name {
  flex: 1;
  font-size: 0.9rem;
  text-align: left;
  cursor: pointer;
}
.habit-actions {
  flex-shrink: 0;
  width: 1.2rem;
  height: 1.2rem;
  font-size: 0.8rem;
  cursor: pointer;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: transparent;
  appearance: none;
  -webkit-appearance: none;
  text-align: center;
  padding: 0;
}
.habit-value-input {
  min-width: 6rem;
  border: 1px solid #ddd;
  border-radius: 3px;
  padding: 2px 6px;
  font-size: 0.85rem;
  background: transparent;
  margin-top: 2px;
}
.habit-value-input:focus {
  outline: 2px solid #4a90d9;
  outline-offset: -1px;
}
</style>
