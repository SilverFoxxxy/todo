import { ref, computed, watch, reactive, onUnmounted } from 'vue';
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
  const day = d.getDay(); // локальный день недели (0 = вс)
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
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
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
    d.setDate(d.getDate() + i); // локальное приращение дня
    days.push(toDateStr(d));
  }
  return days;
});

function getTodosForDay(dateStr) {
  return weekData.value[dateStr] || [];
}

// ================= Мутаторы (помечают неделю dirty и ставят в очередь) =================
function addTodo(dateStr, text) {
  if (!weekData.value[dateStr]) weekData.value[dateStr] = [];
  weekData.value[dateStr].push({
    id: crypto.randomUUID(),
    text,
    status: 'Planned',
  });
  markWeekDirty(getWeekKey(new Date(dateStr)));
  enqueueWeek(getWeekKey(new Date(dateStr)));
}

function updateTodo(dateStr, todoId, changes) {
  const todos = weekData.value[dateStr];
  if (!todos) return;
  const todo = todos.find(t => t.id === todoId);
  if (todo) {
    Object.assign(todo, changes);
  }
  markWeekDirty(getWeekKey(new Date(dateStr)));
  enqueueWeek(getWeekKey(new Date(dateStr)));
}

function deleteTodo(dateStr, todoId) {
  const todos = weekData.value[dateStr];
  if (!todos) return;
  weekData.value[dateStr] = todos.filter(t => t.id !== todoId);
  markWeekDirty(getWeekKey(new Date(dateStr)));
  enqueueWeek(getWeekKey(new Date(dateStr)));
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
const isSyncing = ref(false);
const driveFileIds = reactive({});

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

// ============ Слияние задач (merge) ============
function mergeWeekDays(localObj, cloudObj) {
  const result = {};
  const allDates = new Set([
    ...Object.keys(localObj || {}),
    ...Object.keys(cloudObj || {}),
  ]);
  for (const date of allDates) {
    const localTasks = localObj?.[date] || [];
    const cloudTasks = cloudObj?.[date] || [];
    const merged = new Map();
    for (const t of cloudTasks) merged.set(t.id, t);
    for (const t of localTasks) merged.set(t.id, t);
    result[date] = Array.from(merged.values());
  }
  return result;
}

// ================= Очередь синхронизации =================
const syncQueue = ref([]);
const isProcessingQueue = ref(false);
const totalSyncCount = ref(0);

const syncProgress = computed(() => {
  if (isInSync.value) return 100;
  if (!totalSyncCount.value || totalSyncCount.value === 0) return 0;
  const completed = totalSyncCount.value - syncQueue.value.length;
  return Math.round((completed / totalSyncCount.value) * 100);
});

function enqueueWeek(weekKey) {
  if (!cloudEnabled.value || !isSignedIn.value) return;
  if (!syncQueue.value.includes(weekKey)) {
    syncQueue.value.push(weekKey);
  }
}

async function processQueue() {
  console.log(isInSync.value);
  console.log('queue len:', syncQueue.value.length);
  if (isProcessingQueue.value || syncQueue.value.length === 0) return;
  isProcessingQueue.value = true;
  try {
    while (syncQueue.value.length > 0) {
      const weekKey = syncQueue.value.shift();
      await syncWeek(weekKey);
    }
  } finally {
    isProcessingQueue.value = false;
  }
}

// ================= Отправка конкретной недели (с полным управлением состоянием) =================
async function pushWeekToCloud(weekKey, data) {
  if (!cloudEnabled.value || !isSignedIn.value) return null;
  const fileName = `${weekKey}.json`;
  console.log(`☁️ Отправка недели ${weekKey} в облако…`);
  let newModified = null;
  try {
    let existingId = driveFileIds[weekKey];
    if (existingId) {
      const result = await uploadFile(fileName, data, existingId);
      console.log('   ✅ Обновлён существующий файл');
      newModified = new Date(result.modifiedTime).getTime();
    } else {
      const result = await uploadFile(fileName, data);
      if (result?.id) {
        driveFileIds[weekKey] = result.id;
        console.log(`   ✅ Создан новый файл с ID: ${result.id}`);
        newModified = new Date(result.modifiedTime).getTime();
      }
    }

    if (newModified) {
      const cmap = loadCloudModifiedMap();
      cmap[weekKey] = newModified;
      saveCloudModifiedMap(cmap);
      clearWeekDirty(weekKey); // ← всегда сбрасываем
    }
  } catch (e) {
    if (e.message?.includes('403')) {
      console.warn('   ⚠️ Нет прав на изменение файла');
      return null;
    }
    console.error(`❌ Ошибка отправки ${weekKey}:`, e);
    throw e;
  }
  return newModified;
}

// ================= Синхронизация одной недели =================
async function syncWeek(weekKey) {
  const cloudModifiedMap = loadCloudModifiedMap();
  const dirtyMap = loadDirtyMap();
  const savedCloudModified = cloudModifiedMap[weekKey] || 0;
  const dirty = dirtyMap[weekKey] || false;

  let cloudFile = null;
  try {
    const allFiles = await listWeekFiles();
    const best = {};
    for (const f of allFiles) {
      const match = f.name.match(/^(todo-week-\d{4}-W\d{2})(?:-\d+)?\.json$/);
      if (!match) continue;
      const key = match[1];
      if (key !== weekKey) continue;
      const t = new Date(f.modifiedTime).getTime();
      if (!best[key] || t > best[key].time) best[key] = { file: f, time: t };
    }
    if (best[weekKey]) cloudFile = best[weekKey].file;
  } catch (e) {
    console.warn(`Не удалось получить облачную информацию для ${weekKey}`, e);
  }

  const cloudModified = cloudFile
    ? new Date(cloudFile.modifiedTime).getTime()
    : null;

  // Запоминаем ID облачного файла, чтобы при будущей отправке обновлять, а не создавать дубликат
  if (cloudFile && !driveFileIds[weekKey]) {
    driveFileIds[weekKey] = cloudFile.id;
  }

  // Случай 1: облачного файла ещё нет
  if (!cloudFile) {
    // if (dirty) {
    const raw = localStorage.getItem(weekKey);
    if (raw) {
      const data = JSON.parse(raw);
      console.log('push cause dirty, no cloud file');
      await pushWeekToCloud(weekKey, data);
    }
    // }
    return;
  }

  // Случай 2: облачный файл не менялся с нашей последней синхронизации
  if (cloudModified === savedCloudModified) {
    if (dirty) {
      const raw = localStorage.getItem(weekKey);
      if (raw) {
        const data = JSON.parse(raw);
        console.log('push cause dirty, same cloud file');
        await pushWeekToCloud(weekKey, data);
      }
    }
    return;
  }

  console.log('merge files - cloud file is newer');
  console.log(cloudModified);
  console.log(savedCloudModified);
  // Случай 3: облачный файл изменился – загружаем и сливаем
  let cloudData;
  try {
    cloudData = await downloadFile(cloudFile.id);
  } catch (e) {
    console.warn(`⚠️ Не удалось скачать ${weekKey}.json, пропускаю`);
    return;
  }
  const localRaw = localStorage.getItem(weekKey);
  const localParsed = localRaw ? JSON.parse(localRaw) : {};
  const merged = mergeWeekDays(localParsed, cloudData);

  // Сравниваем merged с облачной версией: если идентичны, нет смысла отправлять
  localStorage.setItem(weekKey, JSON.stringify(merged));

  // Обновляем карту облачных меток в любом случае
  const cmap = loadCloudModifiedMap();
  cmap[weekKey] = cloudModified;
  saveCloudModifiedMap(cmap);

  if (JSON.stringify(merged) !== JSON.stringify(cloudData)) {
    console.log('merge files - cloud file is newer, sending merged version');
    await pushWeekToCloud(weekKey, merged);
  } else {
    console.log(
      'merge files - cloud file is newer but merged identical, skipping upload'
    );
    // Сбрасываем dirty, т.к. теперь локальная версия полностью соответствует облачной
    if (dirty) {
      clearWeekDirty(weekKey);
    }
  }
}

// ================= Сбор всех недель и наполнение очереди =================
async function collectAndEnqueueAllWeeks() {
  if (!cloudEnabled.value || !isSignedIn.value) return;
  try {
    const files = await listWeekFiles();
    const cloudModifiedMap = loadCloudModifiedMap();
    const dirtyMap = loadDirtyMap();

    // Собираем все локальные ключи
    const allWeekKeys = new Set();
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith('todo-week-')) allWeekKeys.add(key);
    }

    // Обрабатываем облачные файлы (убираем дубликаты, оставляем самый свежий)
    const bestCloudFiles = {};
    for (const file of files) {
      const match = file.name.match(
        /^(todo-week-\d{4}-W\d{2})(?:-\d+)?\.json$/
      );
      if (!match) continue;
      const weekKey = match[1];
      const t = new Date(file.modifiedTime).getTime();
      if (!bestCloudFiles[weekKey] || t > bestCloudFiles[weekKey].time) {
        bestCloudFiles[weekKey] = { id: file.id, modifiedTime: t };
      }
      allWeekKeys.add(weekKey);
    }

    totalSyncCount.value = allWeekKeys.size;

    console.log('load all weeks');
    console.log(bestCloudFiles);
    console.log(cloudModifiedMap);
    console.log(dirtyMap);

    // Для каждой недели проверяем, нужна ли синхронизация
    for (const weekKey of allWeekKeys) {
      const cloudFile = bestCloudFiles[weekKey];
      const cloudModified = cloudFile ? cloudFile.modifiedTime : null;
      const savedModified = cloudModifiedMap[weekKey] || 0;
      const dirty = dirtyMap[weekKey] || false;

      console.log('week params: ', cloudModified, savedModified, dirty);

      // Добавляем, если:
      // - облачного файла нет, но есть локальные данные (или dirty)
      // - облачный файл изменился (cloudModified != savedModified)
      // - есть локальные изменения (dirty)
      if (!cloudFile) {
        if (dirty || localStorage.getItem(weekKey)) {
          enqueueWeek(weekKey);
        }
      } else if (cloudModified !== savedModified || dirty) {
        enqueueWeek(weekKey);
      }
    }
  } catch (e) {
    console.warn('Ошибка при сборе недель для синхронизации:', e);
  }
}

const isInSync = computed(
  () =>
    cloudEnabled.value &&
    syncQueue.value.length === 0 &&
    !isProcessingQueue.value
);

// ================= Таймеры =================
let collectTimer = null;
let processTimer = null;

function startTimers() {
  stopTimers();
  // Каждые 10 секунд собираем все недели в очередь
  collectTimer = setInterval(collectAndEnqueueAllWeeks, 10_000);
  // Каждые 2 секунды пытаемся обработать очередь (если есть что и не занято)
  processTimer = setInterval(processQueue, 2_000);
}

function stopTimers() {
  clearInterval(collectTimer);
  clearInterval(processTimer);
  collectTimer = null;
  processTimer = null;
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
      await collectAndEnqueueAllWeeks();
      await processQueue(); // обрабатываем немедленно
      startTimers();
      loadWeek(currentMonday.value);
    }
  }
}

async function enableCloudSync() {
  if (cloudEnabled.value) return;
  console.log('🔐 Запускаю процесс входа…');
  if (!isSignedIn.value) await forceReauth();
  cloudEnabled.value = true;
  console.log('✅ Вход выполнен, начинаю синхронизацию');
  await collectAndEnqueueAllWeeks();
  await processQueue();
  startTimers();
  loadWeek(currentMonday.value);
}

function disableCloudSync() {
  cloudEnabled.value = false;
  signOut();
  for (const key in driveFileIds) delete driveFileIds[key];
  syncQueue.value = [];
  stopTimers();
}

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
    totalSyncCount,
    syncProgress,
    isInSync,
  };
}
