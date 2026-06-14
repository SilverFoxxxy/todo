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

function updateHabit(updates) {
  if (!def.value) return;

  const { name, type } = updates;
  const newName = name?.trim();

  const nameChanged = newName && newName !== def.value.name;
  const typeChanged = type && type !== def.value.type;

  if (!nameChanged && !typeChanged) return;

  const finalName = newName || def.value.name;
  const finalType = type || def.value.type;
  // Ищем существующее определение с таким же именем и типом
  const existingDef = store.habitDefs.value.find(
    d =>
      d.name.toLowerCase() === finalName.toLowerCase() && d.type === finalType
  );

  const newDefId = existingDef?.id || crypto.randomUUID();

  // Получаем текущий массив привычек для этой даты
  const habits = store.weekData.value._habits || {};
  const dayHabits = habits[props.date] || [];

  // Находим индекс старой привычки
  const oldIndex = dayHabits.findIndex(h => h.habitId === def.value.id);

  if (oldIndex !== -1) {
    // Создаём новый массив с заменой на том же индексе
    const newDayHabits = [...dayHabits];
    newDayHabits[oldIndex] = {
      habitId: newDefId,
      value: props.habitEntry.value,
    };

    // Если тип изменился, обновляем значение
    if (typeChanged) {
      const defaultValue =
        type === 'boolean' ? true : type === 'number' ? 0 : '';
      newDayHabits[oldIndex].value = defaultValue;
    }

    // Сохраняем обратно
    store.weekData.value._habits = {
      ...habits,
      [props.date]: newDayHabits,
    };
  }

  // Создаём определение (если его не было)
  if (!existingDef) {
    store.addHabitDef({
      ...def.value,
      id: newDefId,
      name: newName || def.value.name,
      type: type || def.value.type,
    });
  }

  isEditingName.value = false;
}

function saveName() {
  const newName = editedName.value.trim();
  if (!newName || !def.value) {
    isEditingName.value = false;
    return;
  }
  updateHabit({ name: newName });
}

function handleAction(action) {
  if (action === '__delete__') {
    store.setHabitValue(props.date, props.habitEntry.habitId, null);
    return;
  }
  updateHabit({ type: action });
}

function cancelEditingName() {
  isEditingName.value = false;
}

function updateValue(val) {
  store.setHabitValue(props.date, props.habitEntry.habitId, val);
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
