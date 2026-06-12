<script setup>
import { ref } from 'vue';
import { useTodoStore } from '../composables/useTodoStore';

const store = useTodoStore();
const emit = defineEmits(['close']);

// Расширенная палитра
const colorPalette = [
  '#4a90d9', // синий
  '#357abd', // тёмно-синий
  '#2ecc71', // зелёный
  '#1e8449', // тёмно-зелёный
  '#f39c12', // оранжевый
  '#e74c3c', // красный
  '#9b59b6', // фиолетовый
  '#1abc9c', // бирюзовый
  '#e67e22', // тыквенный
  '#3498db', // голубой
  '#e91e63', // розовый
  '#00bcd4', // циан
  '#8bc34a', // лайм
  '#ff5722', // глубокий оранжевый
  '#6F4E37', // кофейный
];

const editingDef = ref(null);
const form = ref({
  name: '',
  type: 'boolean',
  color: colorPalette[0],
});

function openEdit(def) {
  editingDef.value = def;
  form.value = { name: def.name, type: def.type, color: def.color };
}

function openNew() {
  editingDef.value = null;
  form.value = { name: '', type: 'boolean', color: colorPalette[0] };
}

function save() {
  if (!form.value.name.trim()) return;
  const def = {
    ...form.value,
    id: editingDef.value?.id || crypto.randomUUID(),
  };
  if (editingDef.value) {
    store.updateHabitDef(def.id, def);
  } else {
    store.addHabitDef(def);
  }
  openNew();
}

function remove(id) {
  if (confirm('Удалить привычку?')) {
    store.removeHabitDef(id);
    if (editingDef.value?.id === id) openNew();
  }
}
</script>

<template>
  <div
    class="modal-overlay"
    @click.self="emit('close')"
  >
    <div class="modal-content">
      <h3>Редактор привычек</h3>

      <div class="habit-list">
        <div
          v-for="def in store.habitDefs.value"
          :key="def.id"
          class="habit-list-item"
          :class="{ active: editingDef?.id === def.id }"
          :style="{ '--status-color': def.color }"
          @click="openEdit(def)"
        >
          <span class="habit-list-name">{{ def.name }}</span>
          <span class="habit-list-type">{{
            def.type === 'boolean'
              ? 'Да/Нет'
              : def.type === 'number'
                ? 'Число'
                : 'Время'
          }}</span>
        </div>
        <button
          v-if="!editingDef"
          @click="openNew"
          class="add-btn-primary"
        >
          + Добавить привычку
        </button>
      </div>

      <form
        v-if="editingDef !== undefined"
        @submit.prevent="save"
        class="edit-form"
      >
        <label>Название</label>
        <input
          v-model="form.name"
          type="text"
          placeholder="Введите название"
          class="form-input"
        />

        <label>Тип данных</label>
        <select
          v-model="form.type"
          class="form-input"
        >
          <option value="boolean">Да/Нет (отметка)</option>
          <option value="number">Число</option>
          <option value="time">Время</option>
        </select>

        <label>Цвет</label>
        <div class="color-palette">
          <button
            v-for="color in colorPalette"
            :key="color"
            type="button"
            class="color-swatch"
            :class="{ selected: form.color === color }"
            :style="{
              '--swatch-color': color,
              background: `color-mix(in srgb, ${color} 60%, white)`,
              borderColor: form.color === color ? color : 'transparent',
            }"
            @click="form.color = color"
          ></button>
        </div>

        <!-- Предпросмотр -->
        <div
          class="preview-card item-card"
          :style="{ '--status-color': form.color }"
        >
          <span class="preview-name">{{ form.name || 'Пример' }}</span>
        </div>

        <div class="form-actions">
          <button
            type="submit"
            class="save-btn"
          >
            {{ editingDef ? 'Сохранить' : 'Добавить' }}
          </button>
          <button
            v-if="editingDef"
            type="button"
            class="delete-btn-secondary"
            @click="remove(editingDef.id)"
          >
            Удалить
          </button>
          <button
            type="button"
            class="cancel-btn"
            @click="openNew"
          >
            Отмена
          </button>
        </div>
      </form>

      <button
        @click="emit('close')"
        class="close-btn"
      >
        Закрыть
      </button>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: #fff;
  border-radius: 16px;
  padding: 24px;
  max-width: 480px;
  width: 90%;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
}

h3 {
  margin: 0 0 16px 0;
  font-size: 1.3rem;
  color: #333;
}

/* Список привычек */
.habit-list {
  margin-bottom: 20px;
}

.habit-list-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
  border-left: 4px solid color-mix(in srgb, var(--status-color) 30%, white);
  background: color-mix(in srgb, var(--status-color) 15%, white);
  margin-bottom: 4px;
}

.habit-list-item:hover {
  filter: brightness(0.97);
}

.habit-list-item.active {
  box-shadow: 0 0 0 2px #4a90d9;
}

.habit-list-name {
  flex: 1;
  font-size: 0.95rem;
  color: #333;
}

.habit-list-type {
  font-size: 0.8rem;
  color: #666;
}

/* Кнопки */
.add-btn-primary {
  display: block;
  width: 100%;
  margin-top: 8px;
  padding: 10px;
  background: #4a90d9;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.add-btn-primary:hover {
  background: #357abd;
}

/* Форма */
.edit-form {
  margin-top: 16px;
}

.edit-form label {
  display: block;
  font-size: 0.85rem;
  color: #555;
  margin-bottom: 4px;
  margin-top: 12px;
}

.form-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.9rem;
  box-sizing: border-box;
}

.form-input:focus {
  outline: 2px solid #4a90d9;
  outline-offset: -1px;
}

/* Палитра цветов */
.color-palette {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 6px;
}

.color-swatch {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: 2px solid transparent;
  cursor: pointer;
  transition:
    transform 0.15s,
    box-shadow 0.15s;
  position: relative;
}

.color-swatch::after {
  content: '';
  position: absolute;
  top: 4px;
  left: 4px;
  right: 4px;
  bottom: 4px;
  border-radius: 4px;
  background: inherit;
  opacity: 0.15;
}

.color-swatch:hover {
  transform: scale(1.15);
}

.color-swatch.selected {
  border: 3px solid #333;
}

/* Предпросмотр */
.preview-card {
  margin-top: 12px;
  padding: 10px 12px;
  border-left: 4px solid color-mix(in srgb, var(--status-color) 30%, white);
  background: color-mix(in srgb, var(--status-color) 15%, white);
  border-radius: 6px;
}

.preview-name {
  font-size: 0.9rem;
  color: #333;
}

/* Кнопки действий */
.form-actions {
  display: flex;
  gap: 8px;
  margin-top: 20px;
}

.save-btn {
  flex: 1;
  padding: 10px;
  background: #4a90d9;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
}

.save-btn:hover {
  background: #357abd;
}

.delete-btn-secondary {
  padding: 10px 16px;
  background: #fff;
  color: #e74c3c;
  border: 1px solid #e74c3c;
  border-radius: 8px;
  font-size: 0.9rem;
  cursor: pointer;
}

.delete-btn-secondary:hover {
  background: #fde8e8;
}

.cancel-btn {
  padding: 10px 16px;
  background: #fff;
  color: #666;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 0.9rem;
  cursor: pointer;
}

.cancel-btn:hover {
  background: #f5f5f5;
}

.close-btn {
  display: block;
  margin: 16px auto 0;
  padding: 8px 20px;
  background: #f5f5f5;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 0.9rem;
  cursor: pointer;
  color: #666;
}

.close-btn:hover {
  background: #e8e8e8;
}
</style>
