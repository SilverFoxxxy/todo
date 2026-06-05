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

function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

function getWeekKey(date) {
  const monday = getMonday(date);
  const d = new Date(monday);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3);
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const weekNum = Math.ceil(((d - jan1) / 86400000 + 1) / 7);
  return `todo-week-${monday.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function toDateStr(date) {
  const d = new Date(date);
  return d.toISOString().slice(0, 10);
}

// ================= Хранилище недели =================
const weekData = ref({});
const currentMonday = ref(getMonday(new Date()));

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
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dateStr = toDateStr(d);
    if (!weekData.value[dateStr]) weekData.value[dateStr] = [];
  }
}

function saveWeek() {
  const key = getWeekKey(currentMonday.value);
  localStorage.setItem(key, JSON.stringify(weekData.value));
}
watch(weekData, saveWeek, { deep: true });

function shiftWeek(delta) {
  const newMonday = new Date(currentMonday.value);
  newMonday.setDate(newMonday.getDate() + delta * 7);
  currentMonday.value = getMonday(newMonday);
  loadWeek(currentMonday.value);
}

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

function getTodosForDay(dateStr) {
  return weekData.value[dateStr] || [];
}

// ================= Мутаторы (помечают неделю dirty) =================
function addTodo(dateStr, text) {
  if (!weekData.value[dateStr]) weekData.value[dateStr] = [];
  weekData.value[dateStr].push({
    id: crypto.randomUUID(),
    text,
    status: 'Planned',
  });
  markWeekDirty(getWeekKey(new Date(dateStr)));
  scheduleCloudSync(dateStr);
}

function updateTodo(dateStr, todoId, changes) {
  const todos = weekData.value[dateStr];
  if (!todos) return;
  const todo = todos.find(t => t.id === todoId);
  if (todo) {
    Object.assign(todo, changes);
  }
  markWeekDirty(getWeekKey(new Date(dateStr)));
  scheduleCloudSync(dateStr);
}

function deleteTodo(dateStr, todoId) {
  const todos = weekData.value[dateStr];
  if (!todos) return;
  weekData.value[dateStr] = todos.filter(t => t.id !== todoId);
  markWeekDirty(getWeekKey(new Date(dateStr)));
  scheduleCloudSync(dateStr);
}

// ================= Статусы и их порядок =================
const statusOrder = ref([...STATUSES]);

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
function saveStatusOrder() {
  localStorage.setItem('todo-status-order', JSON.stringify(statusOrder.value));
}
loadStatusOrder();
watch(statusOrder, saveStatusOrder, { deep: true });

// ================= Облачные метки и dirty =================
const cloudEnabled = ref(false);
const cloudSyncing = ref('');
const isSyncing = ref(false); // блокирует scheduleCloudSync во время полной синхронизации
const driveFileIds = reactive({});

// Карта облачных меток (modifiedTime файла на Диске)
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

// Карта dirty (были ли локальные изменения)
function loadDirtyMap() {
  try {
    return JSON.parse(localStorage.getItem('todo-dirty-weeks') || '{}');
  } catch {
    return {};
  }
}
function saveDirtyMap(map) {
  localStorage.setItem('todo-dirty-weeks', JSON.stringify(map));
}
function markWeekDirty(weekKey) {
  const map = loadDirtyMap();
  map[weekKey] = true;
  saveDirtyMap(map);
}
function clearWeekDirty(weekKey) {
  const map = loadDirtyMap();
  delete map[weekKey];
  saveDirtyMap(map);
}

// ================= Планировщик отправки =================
const weekSyncTimers = {};

function scheduleCloudSync(dateStr) {
  if (!cloudEnabled.value || !isSignedIn.value || isSyncing.value) return;
  const weekKey = getWeekKey(new Date(dateStr));
  if (weekSyncTimers[weekKey]) clearTimeout(weekSyncTimers[weekKey]);
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

// ================= Инициализация и вход/выход =================
async function initCloudSync() {
  console.log('🚀 Инициализация облачной синхронизации…');
  initGoogleAuth();
  const storedToken = localStorage.getItem('google_token');
  const expires = localStorage.getItem('google_token_expires');
  if (storedToken && expires) {
    const expiryTime = parseInt(expires);
    if (Date.now() < expiryTime) {
      accessToken.value = storedToken;
      isSignedIn.value = true;
      cloudEnabled.value = true;
      await fullSyncFromCloud();
    }
  }
}

async function enableCloudSync() {
  if (cloudEnabled.value) return;
  console.log('🔐 Запускаю процесс входа…');
  if (!isSignedIn.value) await forceReauth();
  cloudEnabled.value = true;
  console.log('✅ Вход выполнен, начинаю синхронизацию');
  await fullSyncFromCloud();
}

function disableCloudSync() {
  cloudEnabled.value = false;
  signOut();
  for (const key in driveFileIds) delete driveFileIds[key];
  stopPolling();
}

// ================= Отправка конкретной недели =================
async function pushWeekToCloud(weekKey, data) {
  if (!cloudEnabled.value || !isSignedIn.value) return;
  const fileName = `${weekKey}.json`;
  cloudSyncing.value = `Отправка ${fileName}…`;
  console.log(`☁️ Отправка недели ${weekKey} в облако…`);
  try {
    let existingId = driveFileIds[weekKey];
    if (existingId) {
      // Проверим, не изменился ли файл в облаке
      const metaRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${existingId}?fields=modifiedTime`,
        { headers: { Authorization: `Bearer ${accessToken.value}` } }
      );
      if (metaRes.ok) {
        const meta = await metaRes.json();
        const currentCloudModified = new Date(meta.modifiedTime).getTime();
        const expectedModified = loadCloudModifiedMap()[weekKey] || 0;
        if (expectedModified && currentCloudModified !== expectedModified) {
          console.warn(
            `⚠️ Облачный файл изменён другим устройством, отправка отменена`
          );
          cloudSyncing.value = '';
          return;
        }
      }
      const result = await uploadFile(fileName, data, existingId);
      const cloudMap = loadCloudModifiedMap();
      cloudMap[weekKey] = new Date(result.modifiedTime).getTime();
      saveCloudModifiedMap(cloudMap);
      clearWeekDirty(weekKey);
      console.log(`   ✅ Обновлён существующий файл`);
      cloudSyncing.value = '';
      return;
    }
    // Новый файл
    const result = await uploadFile(fileName, data);
    if (result?.id) {
      driveFileIds[weekKey] = result.id;
      const cloudMap = loadCloudModifiedMap();
      cloudMap[weekKey] = new Date(result.modifiedTime).getTime();
      saveCloudModifiedMap(cloudMap);
      clearWeekDirty(weekKey);
      console.log(`   ✅ Создан новый файл с ID: ${result.id}`);
    }
    cloudSyncing.value = '';
  } catch (e) {
    if (e.message?.includes('403')) {
      console.warn(`   ⚠️ Нет прав на изменение файла`);
      delete driveFileIds[weekKey];
      cloudSyncing.value = 'Ошибка доступа';
      setTimeout(() => {
        cloudSyncing.value = '';
      }, 5000);
      return;
    }
    console.error(`❌ Ошибка отправки ${weekKey}:`, e);
    cloudSyncing.value = 'Ошибка отправки';
    setTimeout(() => {
      cloudSyncing.value = '';
    }, 3000);
  }
}

// ================= Полная синхронизация (с использованием dirty) =================
async function fullSyncFromCloud() {
  if (!cloudEnabled.value || !isSignedIn.value) return;
  isSyncing.value = true;
  cloudSyncing.value = 'Получение списка файлов…';
  console.log('🔄 Синхронизация с облаком…');
  try {
    const files = await listWeekFiles();
    // Убираем дубликаты: для каждой недели оставляем самый свежий файл
    const bestFiles = {};
    for (const file of files) {
      const match = file.name.match(
        /^(todo-week-\d{4}-W\d{2})(?:-\d+)?\.json$/
      );
      if (!match) continue;
      const baseKey = match[1];
      const fileTime = new Date(file.modifiedTime).getTime();
      if (!bestFiles[baseKey] || fileTime > bestFiles[baseKey].time) {
        bestFiles[baseKey] = { file, time: fileTime };
      }
    }
    const uniqueFiles = Object.values(bestFiles).map(item => item.file);
    cloudSyncing.value = `Найдено ${uniqueFiles.length} файлов`;
    console.log(`📁 Найдено ${uniqueFiles.length} файлов недель на Диске`);

    const cloudModifiedMap = loadCloudModifiedMap();
    const dirtyMap = loadDirtyMap();
    let processed = 0;

    for (const file of uniqueFiles) {
      const key = file.name
        .replace(/-\d+\.json$/, '.json')
        .replace('.json', '');
      const cloudModified = new Date(file.modifiedTime).getTime();
      const savedCloudModified = cloudModifiedMap[key] || 0;
      const dirty = dirtyMap[key] || false;

      // Правило 1: облако не менялось и нет локальных правок
      if (!dirty && cloudModified === savedCloudModified) {
        console.log(`   ⏩ ${file.name} не изменился, пропускаю`);
        continue;
      }

      // Правило 2: есть локальные правки, облако не менялось — отправляем
      if (dirty && cloudModified === savedCloudModified) {
        console.log(
          `   🔼 Локальные изменения для ${key}, облако не менялось – отправляю`
        );
        const localRaw = localStorage.getItem(key);
        if (localRaw) {
          try {
            const localData = JSON.parse(localRaw);
            await pushWeekToCloud(key, localData);
          } catch (e) {
            console.warn(`Ошибка отправки ${key}:`, e);
          }
        }
        continue;
      }

      // Правило 3: облако изменилось (или dirty && cloudModified != savedCloudModified) — принимаем облачную версию
      cloudSyncing.value = `Загрузка ${file.name} (${++processed}/${uniqueFiles.length})…`;
      console.log(`   📥 Загрузка ${file.name} (облако изменилось)`);
      let cloudData;
      try {
        cloudData = await downloadFile(file.id);
      } catch (e) {
        console.warn(`⚠️ Не удалось скачать ${file.name}, пропускаю`);
        continue;
      }
      localStorage.setItem(key, JSON.stringify(cloudData));
      cloudModifiedMap[key] = cloudModified;
      clearWeekDirty(key);
    }

    saveCloudModifiedMap(cloudModifiedMap);
    console.log('✅ Синхронизация завершена');
    loadWeek(currentMonday.value);
  } catch (err) {
    console.error('❌ Ошибка синхронизации:', err);
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

// ================= Периодический опрос =================
let pollTimeout = null;
const POLL_INTERVAL = 30000;

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
      const key = file.name
        .replace(/-\d+\.json$/, '.json')
        .replace('.json', '');
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
// Запускаем опрос после входа
watch(cloudEnabled, val => {
  if (val) startPolling();
  else stopPolling();
});

// ================= Экспорт =================
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
    cloudEnabled,
    cloudSyncing,
    initCloudSync,
    enableCloudSync,
    disableCloudSync,
  };
}
