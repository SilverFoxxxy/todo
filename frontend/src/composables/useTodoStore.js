import { ref, computed, watch, reactive } from 'vue';
import {
  isSignedIn,
  signIn,
  signOut,
  trySilentLogin,
  initGoogleAuth,
  listWeekFiles,
  downloadFile,
  uploadFile,
  accessToken,
  forceReauth,
  clearTokenStorage,
} from './useGoogleDrive';

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
  scheduleCloudSync(dateStr);
}

// Обновить задачу (изменение текста или статуса)
function updateTodo(dateStr, todoId, changes) {
  const todos = weekData.value[dateStr];
  if (!todos) return;
  const todo = todos.find(t => t.id === todoId);
  if (todo) {
    Object.assign(todo, changes);
  }
  scheduleCloudSync(dateStr);
}

// Удалить задачу
function deleteTodo(dateStr, todoId) {
  const todos = weekData.value[dateStr];
  if (!todos) return;
  weekData.value[dateStr] = todos.filter(t => t.id !== todoId);
  scheduleCloudSync(dateStr);
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

// Облачная синхронизация
const cloudEnabled = ref(false);
const isSyncing = ref(false);
const cloudSyncing = ref('');
const driveFileIds = reactive({}); // { 'todo-week-2026-W23': 'fileId' }

function loadLocalModifiedMap() {
  try {
    return JSON.parse(localStorage.getItem('todo-local-modified') || '{}');
  } catch {
    return {};
  }
}

function saveLocalModifiedMap(map) {
  localStorage.setItem('todo-local-modified', JSON.stringify(map));
}

function updateLocalModified(weekKey) {
  const map = loadLocalModifiedMap();
  map[weekKey] = Date.now();
  saveLocalModifiedMap(map);
}

// Локальное хранилище меток облачных изменений
function loadCloudModifiedMap() {
  try {
    return JSON.parse(localStorage.getItem('todo-cloud-modified') || '{}');
  } catch {
    return {};
  }
}

function saveCloudModifiedMap(map) {
  localStorage.setItem('todo-cloud-modified', JSON.stringify(map));
}

// Планировщик отправки отдельной недели (дебаунс 2 сек)
const weekSyncTimers = {};

function scheduleCloudSync(dateStr) {
  if (!cloudEnabled.value || !isSignedIn.value || isSyncing.value) return;
  const weekKey = getWeekKey(new Date(dateStr));
  updateLocalModified(weekKey); // запоминаем время локального изменения

  if (weekSyncTimers[weekKey]) {
    clearTimeout(weekSyncTimers[weekKey]);
  }

  weekSyncTimers[weekKey] = setTimeout(() => {
    const raw = localStorage.getItem(weekKey);
    if (raw) {
      try {
        const data = JSON.parse(raw);
        pushWeekToCloud(weekKey, data);
      } catch (e) {
        console.warn(`Ошибка отправки недели ${weekKey}:`, e);
      }
    }
    delete weekSyncTimers[weekKey];
  }, 2000);
}

// Инициализация облачной синхронизации при старте
async function initCloudSync() {
  console.log('🚀 Инициализация облачной синхронизации…');
  initGoogleAuth();

  const storedToken = localStorage.getItem('google_token');
  const expires = localStorage.getItem('google_token_expires');
  if (storedToken && expires) {
    const savedScope = localStorage.getItem('google_token_scope');
    const expiryTime = parseInt(expires);
    if (Date.now() < expiryTime) {
      accessToken.value = storedToken;
      isSignedIn.value = true;
      cloudEnabled.value = true;
      await fullSyncFromCloud();
      if (cloudEnabled.value) {
        startPolling();
      }
    } else {
      // Можно попытаться тихий вход, но пока оставим
    }
  } else {
    console.log('🔍 Токен не найден, жду ручного входа');
  }
}

// Ручной вход через forceReauth
async function enableCloudSync() {
  if (cloudEnabled.value) return;
  console.log('🔐 Запускаю процесс входа…');
  if (!isSignedIn.value) {
    await forceReauth();
  }
  cloudEnabled.value = true;
  console.log('✅ Вход выполнен, начинаю синхронизацию');
  await fullSyncFromCloud();
  startPolling();
}

// Выход из облачной синхронизации
function disableCloudSync() {
  cloudEnabled.value = false;
  stopPolling();
  signOut();
  // Очищаем кэш ID файлов
  for (const key in driveFileIds) {
    delete driveFileIds[key];
  }
}

// Отправка конкретной недели в облако
async function pushWeekToCloud(weekKey, data) {
  if (!cloudEnabled.value || !isSignedIn.value) return;
  const fileName = `${weekKey}.json`;
  cloudSyncing.value = `Отправка ${fileName}…`;
  console.log(`☁️ Отправка недели ${weekKey} в облако…`);
  try {
    let existingId = driveFileIds[weekKey];
    if (existingId) {
      try {
        const result = await uploadFile(fileName, data, existingId); // data без _lastModified
        const cloudMap = loadCloudModifiedMap();
        cloudMap[weekKey] = new Date(result.modifiedTime).getTime();
        saveCloudModifiedMap(cloudMap);
        console.log(`   ✅ Обновлён существующий файл`);
        cloudSyncing.value = '';
        return;
      } catch (e) {
        /* обработка 403 как раньше */
      }
    }
    // создание нового файла
    const result = await uploadFile(fileName, data);
    if (result?.id) {
      driveFileIds[weekKey] = result.id;
      const cloudMap = loadCloudModifiedMap();
      cloudMap[weekKey] = new Date(result.modifiedTime).getTime();
      saveCloudModifiedMap(cloudMap);
      console.log(`   ✅ Создан новый файл с ID: ${result.id}`);
    }
    cloudSyncing.value = '';
  } catch (e) {
    /* обработка ошибок */
  }
}

// Полная синхронизация с облаком (используется при старте и после входа)
async function fullSyncFromCloud() {
  if (!cloudEnabled.value || !isSignedIn.value) return;
  isSyncing.value = true;
  cloudSyncing.value = 'Получение списка файлов…';
  console.log('🔄 Начинаю полную синхронизацию с Google Диском…');
  try {
    const files = await listWeekFiles();
    cloudSyncing.value = `Найдено ${files.length} файлов`;
    console.log(`📁 Найдено ${files.length} файлов недель на Диске`);

    const cloudModifiedMap = loadCloudModifiedMap();
    const localModifiedMap = loadLocalModifiedMap();
    let processed = 0;

    for (const file of files) {
      const key = file.name.replace('.json', '');
      const cloudModified = new Date(file.modifiedTime).getTime();
      const savedCloudModified = cloudModifiedMap[key] || 0;

      // Шаг 1: если облачное время не изменилось, пропускаем
      if (cloudModified === savedCloudModified) {
        console.log(`   ⏩ ${file.name} не изменился, пропускаю`);
        continue;
      }

      // Файл изменился в облаке
      cloudSyncing.value = `Загрузка ${file.name} (${++processed}/${files.length})…`;
      console.log(`   📥 Загрузка ${file.name}…`);
      let cloudData;
      try {
        cloudData = await downloadFile(file.id);
      } catch (e) {
        console.warn(`⚠️ Не удалось скачать ${file.name}, пропускаю`);
        continue;
      }

      const localParsed = (() => {
        const raw = localStorage.getItem(key);
        if (raw)
          try {
            return JSON.parse(raw);
          } catch (e) {}
        return null;
      })();

      const localModified = localModifiedMap[key] || 0;

      // Шаг 2: сравнение локального времени с облачным
      if (localModified > cloudModified) {
        // Локальная версия новее — отправляем в облако
        console.log(`      🔽 Локальная версия новее, отправляю в облако`);
        await pushWeekToCloud(key, localParsed); // pushWeekToCloud обновит cloudModifiedMap
      } else {
        // Облачная версия новее (или равна) — сохраняем локально
        console.log(`      🔼 Облачная версия новее, сохраняю локально`);
        localStorage.setItem(key, JSON.stringify(cloudData));
        cloudModifiedMap[key] = cloudModified;
        localModifiedMap[key] = cloudModified; // синхронизируем локальную метку
      }
    }

    saveCloudModifiedMap(cloudModifiedMap);
    saveLocalModifiedMap(localModifiedMap);

    // Синхронизируем локальные недели, которых нет в облаке (опционально)
    await syncAllLocalWeeks(); // внутри использует ту же логику

    console.log('✅ Полная синхронизация завершена');
    loadWeek(currentMonday.value);
  } catch (err) {
    console.error('❌ Критическая ошибка полной синхронизации:', err);
    cloudSyncing.value = 'Ошибка синхронизации';
    setTimeout(() => {
      cloudSyncing.value = '';
    }, 3000);
  } finally {
    isSyncing.value = false;
    if (cloudSyncing.value !== 'Ошибка синхронизации')
      cloudSyncing.value = 'In sync';
  }
}

// Отправка всех локальных недель, которых нет в облаке или которые новее (используется при импорте)
async function syncAllLocalWeeks() {
  if (!cloudEnabled.value || !isSignedIn.value) return;
  cloudSyncing.value = 'Синхронизация всех локальных недель…';
  console.log('📤 Проверяю все локальные недели…');

  let cloudFiles = [];
  try {
    cloudFiles = await listWeekFiles();
  } catch (e) {
    console.warn('⚠️ Не удалось получить список облачных файлов');
  }

  const cloudFileMap = {};
  for (const file of cloudFiles) {
    cloudFileMap[file.name] = file;
  }

  const localKeys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith('todo-week-')) localKeys.push(key);
  }

  const localModifiedMap = loadLocalModifiedMap();
  const cloudModifiedMap = loadCloudModifiedMap();

  for (const key of localKeys) {
    const localRaw = localStorage.getItem(key);
    if (!localRaw) continue;
    let localParsed;
    try {
      localParsed = JSON.parse(localRaw);
    } catch (e) {
      continue;
    }
    const localModified = localModifiedMap[key] || 0;

    const cloudFile = cloudFileMap[`${key}.json`];
    const cloudModified = cloudFile
      ? new Date(cloudFile.modifiedTime).getTime()
      : 0;

    if (!cloudFile) {
      // Нет в облаке — создаём
      console.log(`   🆕 Создаю облачный файл для ${key}`);
      await pushWeekToCloud(key, localParsed);
    } else if (localModified > cloudModified) {
      // Локальная новее — отправляем
      console.log(`   ⬆️ Локальная версия ${key} новее, отправляю`);
      await pushWeekToCloud(key, localParsed);
    } else {
      // Облачная актуальна (или равна) — ничего не делаем
      console.log(`   ✅ ${key} – актуальная версия уже в облаке`);
    }
  }

  console.log('✅ Отправка всех локальных недель завершена');
  isSyncing.value = false;
  if (cloudSyncing.value !== 'Ошибка синхронизации')
    cloudSyncing.value = 'In sync';
}

// Первоначальная загрузка локальных данных
loadWeek(currentMonday.value);
let pollTimeout = null;
const POLL_INTERVAL = 10000;

async function pollOnce() {
  if (!cloudEnabled.value || !isSignedIn.value || isSyncing.value) return;
  if (document.visibilityState === 'hidden') {
    scheduleNextPoll();
    return;
  }
  console.log('🔄 Периодическая проверка облака…');
  try {
    const files = await listWeekFiles();
    const cloudModifiedMap = loadCloudModifiedMap();
    let hasChanges = false;
    for (const file of files) {
      const key = file.name.replace('.json', '');
      const cloudModified = new Date(file.modifiedTime).getTime();
      if (cloudModifiedMap[key] !== cloudModified) {
        hasChanges = true;
        break;
      }
    }
    if (hasChanges) {
      console.log('🔁 Обнаружены изменения, запускаю синхронизацию');
      await fullSyncFromCloud();
    }
  } catch (e) {
    console.warn('Ошибка периодической проверки:', e);
  } finally {
    scheduleNextPoll();
  }
}

function scheduleNextPoll() {
  if (!cloudEnabled.value) return;
  pollTimeout = setTimeout(pollOnce, POLL_INTERVAL);
}

function startPolling() {
  stopPolling();
  scheduleNextPoll();
}

function stopPolling() {
  clearTimeout(pollTimeout);
  pollTimeout = null;
}

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
    cloudEnabled,
    cloudSyncing,
    initCloudSync,
    enableCloudSync,
    disableCloudSync,
    fullSyncFromCloud,
    syncAllLocalWeeks,
  };
}
