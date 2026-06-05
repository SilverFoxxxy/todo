import { ref, computed, watch } from 'vue';

const STATUSES = ['Planned', 'Postponed', 'Done', 'Cancelled', 'Caught Up'];

// Вспомогательная функция: получить понедельник для даты
function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = ВС
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // поправка для ПН
  return new Date(d.setDate(diff));
}

// Ключ для localStorage в формате "todo-week-ГГГГ-WНН"
function getWeekKey(date) {
  const monday = getMonday(date);
  // ISO week number
  const d = new Date(monday);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3); // Четверг
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const weekNum = Math.ceil(((d - jan1) / 86400000 + 1) / 7);
  return `todo-week-${monday.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

// Форматирование даты YYYY-MM-DD
function toDateStr(date) {
  const d = new Date(date);
  return d.toISOString().slice(0, 10);
}

// Хранилище в оперативной памяти (реактивный объект)
const weekData = ref({}); // { 'YYYY-MM-DD': [ { id, text, status }, ... ], ... }

// Текущий понедельник отображаемой недели (реактивно)
const currentMonday = ref(getMonday(new Date()));

// Загрузка недели из localStorage
function loadWeek(date) {
  const monday = getMonday(date);
  const key = getWeekKey(monday);
  const raw = localStorage.getItem(key);
  if (raw) {
    try {
      weekData.value = JSON.parse(raw);
    } catch (e) {
      weekData.value = {};
    }
  } else {
    weekData.value = {};
  }

  // Гарантируем, что для всех 7 дней недели есть массив
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dateStr = toDateStr(d);
    if (!weekData.value[dateStr]) {
      weekData.value[dateStr] = [];
    }
  }
}

// Сохранение текущей недели в localStorage
function saveWeek() {
  const key = getWeekKey(currentMonday.value);
  localStorage.setItem(key, JSON.stringify(weekData.value));
}

// Автосохранение при изменении данных (watch на weekData)
watch(weekData, saveWeek, { deep: true });

// Переключение недели (влево/вправо)
function shiftWeek(delta) {
  const newMonday = new Date(currentMonday.value);
  newMonday.setDate(newMonday.getDate() + delta * 7);
  currentMonday.value = getMonday(newMonday);
  loadWeek(currentMonday.value);
}

// Массив дат текущей недели (ПН..ВС)
const weekDays = computed(() => {
  const days = [];
  const start = new Date(currentMonday.value);
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(toDateStr(d));
  }
  return days;
});

// Получить список дел для конкретного дня
function getTodosForDay(dateStr) {
  return weekData.value[dateStr] || [];
}

// Добавить задачу в день
function addTodo(dateStr, text) {
  if (!weekData.value[dateStr]) {
    weekData.value[dateStr] = [];
  }
  const newTodo = {
    id: crypto.randomUUID(),
    text,
    status: 'Planned',
  };
  weekData.value[dateStr].push(newTodo);
}

// Обновить задачу (изменение текста или статуса)
function updateTodo(dateStr, todoId, changes) {
  const todos = weekData.value[dateStr];
  if (!todos) return;
  const todo = todos.find(t => t.id === todoId);
  if (todo) {
    Object.assign(todo, changes);
  }
}

// Удалить задачу
function deleteTodo(dateStr, todoId) {
  const todos = weekData.value[dateStr];
  if (!todos) return;
  weekData.value[dateStr] = todos.filter(t => t.id !== todoId);
}

// Порядок статусов (пользовательский)
const statusOrder = ref([...STATUSES]);

// Загрузка порядка из localStorage
function loadStatusOrder() {
  const saved = localStorage.getItem('todo-status-order');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (
        Array.isArray(parsed) &&
        parsed.length === STATUSES.length &&
        parsed.every(s => STATUSES.includes(s))
      ) {
        statusOrder.value = parsed;
      }
    } catch (e) {}
  }
}

// Сохранение порядка
function saveStatusOrder() {
  localStorage.setItem('todo-status-order', JSON.stringify(statusOrder.value));
}

// Вызови при инициализации
loadStatusOrder();

// Автосохранение при изменении порядка
watch(statusOrder, saveStatusOrder, { deep: true });

// Первоначальная загрузка
loadWeek(currentMonday.value);

export function useTodoStore() {
  return {
    STATUSES,
    currentMonday,
    weekDays,
    weekData,
    getTodosForDay,
    addTodo,
    updateTodo,
    deleteTodo,
    shiftWeek,
    statusOrder,
  };
}
