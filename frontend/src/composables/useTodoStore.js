import { ref, computed, watch, reactive } from 'vue';
import {
  isSignedIn,
  signIn,
  signOut,
  trySilentLogin,
  initGoogleAuth,
  listWeekFiles as _listWeekFiles,
  downloadFile,
  uploadFile,
  accessToken,
  forceReauth,
  clearTokenStorage,
} from './useGoogleDrive';
import {
  getMonday,
  getWeekKey,
  toDateStr,
  getDayName,
} from '../utils/dateUtils';

// ---------- Вспомогательные функции ----------
const STATUSES = ['Planned', 'Postponed', 'Done', 'Cancelled', 'Caught Up'];

// Кэширование listWeekFiles (2 секунды)
let cachedFiles = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 2000;

async function listWeekFiles() {
  const now = Date.now();
  if (cachedFiles && now - cacheTimestamp < CACHE_DURATION) {
    return cachedFiles;
  }
  const files = await _listWeekFiles();
  cachedFiles = files;
  cacheTimestamp = now;
  return files;
}

// ---------- Данные недели ----------
const weekData = ref({});
const currentMonday = ref(getMonday(new Date()));

function loadWeek(date) {
  const monday = getMonday(date);
  const key = getWeekKey(monday);
  const raw = localStorage.getItem(key);
  if (raw) {
    try {
      weekData.value = JSON.parse(raw);
    } catch {
      weekData.value = {};
    }
  } else {
    weekData.value = {};
  }
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    const dateStr = toDateStr(d);
    if (!weekData.value[dateStr]) weekData.value[dateStr] = [];
  }
  // Не принуждаем создание _habits, компоненты должны проверять наличие
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

// ---------- Мутаторы задач ----------
function addTodo(dateStr, text) {
  if (!weekData.value[dateStr]) weekData.value[dateStr] = [];
  weekData.value[dateStr].push({
    id: crypto.randomUUID(),
    text,
    status: 'Planned',
  });
  markWeekDirty(getWeekKey(new Date(dateStr)));
  enqueueFile(getWeekKey(new Date(dateStr)));
}

function updateTodo(dateStr, todoId, changes) {
  const todos = weekData.value[dateStr];
  if (!todos) return;
  const todo = todos.find(t => t.id === todoId);
  if (todo) Object.assign(todo, changes);
  markWeekDirty(getWeekKey(new Date(dateStr)));
  enqueueFile(getWeekKey(new Date(dateStr)));
}

function deleteTodo(dateStr, todoId) {
  const todos = weekData.value[dateStr];
  if (!todos) return;
  weekData.value[dateStr] = todos.filter(t => t.id !== todoId);
  markWeekDirty(getWeekKey(new Date(dateStr)));
  enqueueFile(getWeekKey(new Date(dateStr)));
}

// ---------- Статусы ----------
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
    } catch {}
  }
}
function saveStatusOrder() {
  localStorage.setItem('todo-status-order', JSON.stringify(statusOrder.value));
}
loadStatusOrder();
watch(statusOrder, saveStatusOrder, { deep: true });

// ---------- Облачные метки и dirty ----------
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

// ---------- Привычки ----------
const habitDefs = ref(loadHabitDefs());

function loadHabitDefs() {
  try {
    return JSON.parse(localStorage.getItem('habits-definitions') || '[]');
  } catch {
    return [];
  }
}
function saveHabitDefs(defs) {
  localStorage.setItem('habits-definitions', JSON.stringify(defs));
}
watch(
  habitDefs,
  newVal => {
    saveHabitDefs(newVal);
    scheduleHabitDefsSync();
  },
  { deep: true }
);

let habitDefsFileId = null;

function scheduleHabitDefsSync() {
  if (!cloudEnabled.value || !isSignedIn.value) return;
  clearTimeout(habitDefsSyncTimer);
  habitDefsSyncTimer = setTimeout(async () => {
    try {
      if (!habitDefsFileId) {
        const files = await listWeekFiles();
        const f = files.find(f => f.name === 'habits-definitions.json');
        if (f) habitDefsFileId = f.id;
      }
      if (habitDefsFileId) {
        await uploadFile(
          'habits-definitions.json',
          habitDefs.value,
          habitDefsFileId
        );
      } else {
        const res = await uploadFile(
          'habits-definitions.json',
          habitDefs.value
        );
        if (res?.id) habitDefsFileId = res.id;
      }
    } catch (e) {
      console.warn('Sync habit defs error', e);
    }
  }, 2000);
}
let habitDefsSyncTimer;

async function syncHabitsFromCloud(cloudFile) {
  const cloudData = await downloadFile(cloudFile.id);
  habitDefsFileId = cloudFile.id;
  const localDefs = loadHabitDefs();
  if (localDefs.length === 0) {
    habitDefs.value = cloudData;
    saveHabitDefs(cloudData);
  }
}

function setHabitValue(dateStr, habitId, value) {
  const habits = weekData.value._habits || {};
  let dayHabits = habits[dateStr] || [];

  if (value === null || value === '' || value === 0) {
    dayHabits = dayHabits.filter(h => h.habitId !== habitId);
    // cleanupUnusedHabitDefs() — вызываем реже, не при каждом удалении
  } else {
    const existing = dayHabits.find(h => h.habitId === habitId);
    if (existing) {
      existing.value = value;
    } else {
      dayHabits.push({ habitId, value });
    }
  }

  habits[dateStr] = dayHabits;
  weekData.value._habits = { ...habits };

  const weekKey = getWeekKey(new Date(dateStr));
  markWeekDirty(weekKey);
  enqueueFile(weekKey);
}

function getHabitValue(dateStr, habitId) {
  const arr = weekData.value._habits?.[dateStr] || [];
  return arr.find(h => h.habitId === habitId)?.value ?? null;
}

function cleanupUnusedHabitDefs() {
  const usedIds = new Set();
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key.startsWith('todo-week-')) continue;
    try {
      const data = JSON.parse(localStorage.getItem(key));
      if (data._habits) {
        for (const day of Object.values(data._habits)) {
          if (Array.isArray(day)) {
            day.forEach(h => usedIds.add(h.habitId));
          }
        }
      }
    } catch (e) {}
  }
  if (weekData.value._habits) {
    for (const day of Object.values(weekData.value._habits)) {
      if (Array.isArray(day)) {
        day.forEach(h => usedIds.add(h.habitId));
      }
    }
  }
  const before = habitDefs.value.length;
  habitDefs.value = habitDefs.value.filter(d => usedIds.has(d.id));
  if (before !== habitDefs.value.length) {
    saveHabitDefs(habitDefs.value);
  }
}

// ---------- Слияние ----------
function mergeWeekDays(localObj, cloudObj) {
  const result = {};
  const allDates = new Set([
    ...Object.keys(localObj || {}),
    ...Object.keys(cloudObj || {}),
  ]);
  for (const date of allDates) {
    // Сливаем задачи (массивы)
    const localTasks = Array.isArray(localObj?.[date]) ? localObj[date] : [];
    const cloudTasks = Array.isArray(cloudObj?.[date]) ? cloudObj[date] : [];
    const merged = new Map();
    for (const t of cloudTasks) merged.set(t.id, t);
    for (const t of localTasks) merged.set(t.id, t);
    result[date] = Array.from(merged.values());
  }
  // Сливаем привычки (объекты)
  const localHabits = localObj?._habits || {};
  const cloudHabits = cloudObj?._habits || {};
  result._habits = { ...cloudHabits, ...localHabits };
  return result;
}

// ---------- Очередь (последовательная) ----------
const syncQueue = ref([]);
const isProcessingQueue = ref(false);

function enqueueFile(fileName) {
  if (!cloudEnabled.value || !isSignedIn.value) return;
  if (!syncQueue.value.includes(fileName)) {
    console.log('enqueueFile', fileName);
    syncQueue.value.push(fileName);
  }
}

async function processQueue() {
  if (isProcessingQueue.value || syncQueue.value.length === 0) return;
  console.log('processQueue start, queue:', syncQueue.value.length);
  isProcessingQueue.value = true;
  try {
    while (syncQueue.value.length > 0) {
      const fileName = syncQueue.value.shift();
      if (!fileName) break;
      await syncFile(fileName);
    }
  } finally {
    isProcessingQueue.value = false;
  }
}

// ---------- Отправка файла ----------
async function pushFileToCloud(weekKey, data) {
  if (!cloudEnabled.value || !isSignedIn.value) return null;
  const fileName = `${weekKey}.json`; // <-- добавляем расширение здесь
  console.log(`☁️ Отправка ${fileName}…`);
  try {
    let existingId = driveFileIds[weekKey]; // <-- используем weekKey без .json
    if (existingId) {
      const result = await uploadFile(fileName, data, existingId);
      console.log('   ✅ Обновлён существующий файл');
      return new Date(result.modifiedTime).getTime();
    }
    const result = await uploadFile(fileName, data);
    if (result?.id) {
      driveFileIds[weekKey] = result.id; // сохраняем ID под чистым ключом
      console.log(`   ✅ Создан новый файл с ID: ${result.id}`);
      return new Date(result.modifiedTime).getTime();
    }
    return null;
  } catch (e) {
    if (e.message?.includes('403')) {
      console.warn('   ⚠️ Нет прав на изменение файла');
      return null;
    }
    console.error(`❌ Ошибка отправки ${fileName}:`, e);
    throw e;
  }
}

// ---------- Синхронизация одного файла ----------
async function syncFile(fileName) {
  if (fileName === 'habits-definitions.json') {
    await syncHabitsFile(fileName);
    return;
  }
  await syncWeek(fileName);
}

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

  if (cloudFile && !driveFileIds[weekKey]) {
    driveFileIds[weekKey] = cloudFile.id;
  }

  // Случай 1: облачного файла ещё нет
  if (!cloudFile) {
    if (dirty) {
      const raw = localStorage.getItem(weekKey);
      if (raw) {
        const data = JSON.parse(raw);
        console.log('push cause dirty, no cloud file');
        console.log('syncWeek: will push', weekKey);

        await pushFileToCloud(weekKey, data);
      }
    }
    return;
  }

  // Случай 2: облачный файл не менялся с нашей последней синхронизации
  if (cloudModified === savedCloudModified) {
    if (dirty) {
      const raw = localStorage.getItem(weekKey);
      if (raw) {
        const data = JSON.parse(raw);
        console.log('push cause dirty, same cloud file');
        console.log('syncWeek: will push', weekKey);

        await pushFileToCloud(weekKey, data);
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

  // Если локально не было изменений – просто принимаем облачную версию
  if (!dirty) {
    console.log('not dirty, save cloudData');
    localStorage.setItem(weekKey, JSON.stringify(cloudData));
    const cmap = loadCloudModifiedMap();
    cmap[weekKey] = cloudModified;
    saveCloudModifiedMap(cmap);
    if (weekKey === getWeekKey(currentMonday.value))
      loadWeek(currentMonday.value);
    return;
  }

  // Если есть локальные изменения, сравниваем merged с облаком
  if (JSON.stringify(merged) == JSON.stringify(cloudData)) {
    console.log('merged == cloudData, skip');
    localStorage.setItem(weekKey, JSON.stringify(cloudData));
    const cmap = loadCloudModifiedMap();
    cmap[weekKey] = cloudModified;
    saveCloudModifiedMap(cmap);
    clearWeekDirty(weekKey);
    if (weekKey === getWeekKey(currentMonday.value))
      loadWeek(currentMonday.value);
    return;
  }

  // merged отличается – отправляем его в облако
  console.log('merge files - cloud file is newer, sending merged version');
  localStorage.setItem(weekKey, JSON.stringify(merged));
  const cmap = loadCloudModifiedMap();
  cmap[weekKey] = cloudModified;
  saveCloudModifiedMap(cmap);
  await pushFileToCloud(weekKey, merged);
  if (weekKey === getWeekKey(currentMonday.value))
    loadWeek(currentMonday.value);
}

async function syncHabitsFile(fileName) {
  const cloudModifiedMap = loadCloudModifiedMap();
  const savedCloudModified = cloudModifiedMap[fileName] || 0;

  let cloudFile = null;
  try {
    const allFiles = await listWeekFiles();
    const f = allFiles.find(f => f.name === fileName);
    if (f) cloudFile = f;
  } catch (e) {
    console.warn(`Не удалось получить облачную информацию для ${fileName}`, e);
  }

  const cloudModified = cloudFile
    ? new Date(cloudFile.modifiedTime).getTime()
    : null;

  if (cloudFile && !habitDefsFileId) habitDefsFileId = cloudFile.id;

  if (!cloudFile) {
    if (habitDefs.value.length > 0) {
      await pushFileToCloud(fileName.replace(/\.json$/, ''), habitDefs.value);
    }
    return;
  }

  if (cloudModified === savedCloudModified) {
    return;
  }

  const cloudData = await downloadFile(cloudFile.id);
  const localDefs = habitDefs.value;
  const merged = [...cloudData];
  for (const localDef of localDefs) {
    const idx = merged.findIndex(d => d.id === localDef.id);
    if (idx >= 0) merged[idx] = localDef;
    else merged.push(localDef);
  }
  habitDefs.value = merged;
  saveHabitDefs(merged);

  const cmap = loadCloudModifiedMap();
  cmap[fileName] = cloudModified;
  saveCloudModifiedMap(cmap);
}

// ---------- Полная синхронизация ----------
async function fullSync() {
  console.log('fullSync start');
  if (!cloudEnabled.value || !isSignedIn.value) return;
  isSyncing.value = true;
  cloudSyncing.value = 'Полная синхронизация…';
  console.log('🔄 Полная синхронизация…');
  try {
    const files = await listWeekFiles();
    const cloudModifiedMap = loadCloudModifiedMap();
    const dirtyMap = loadDirtyMap();

    // Локальные файлы
    const allFileNames = new Set();
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith('todo-week-')) allFileNames.add(`${key}.json`);
    }
    if (localStorage.getItem('habits-definitions')) {
      allFileNames.add('habits-definitions.json');
    }

    // Облачные файлы (убираем дубликаты)
    const bestFiles = {};
    for (const file of files) {
      const match = file.name.match(
        /^(todo-week-\d{4}-W\d{2})(?:-\d+)?\.json$/
      );
      if (match) {
        const weekKey = match[1];
        const t = new Date(file.modifiedTime).getTime();
        if (!bestFiles[weekKey] || t > bestFiles[weekKey].time) {
          bestFiles[weekKey] = { file, time: t };
        }
        allFileNames.add(`${weekKey}.json`);
      } else if (file.name === 'habits-definitions.json') {
        allFileNames.add(file.name);
        bestFiles[file.name] = {
          file,
          time: new Date(file.modifiedTime).getTime(),
        };
      }
    }

    // Фильтруем и ставим в очередь только те, где есть изменения
    for (const fileName of allFileNames) {
      const cloudInfo =
        bestFiles[fileName] || bestFiles[fileName.replace('.json', '')];
      const cloudModified = cloudInfo ? cloudInfo.time : null;
      const savedModified = cloudModifiedMap[fileName] || 0;
      const dirty =
        fileName === 'habits-definitions.json'
          ? false
          : dirtyMap[fileName.replace('.json', '')] || false;

      if (!cloudInfo || cloudModified !== savedModified || dirty) {
        enqueueFile(fileName.replace(/\.json$/, ''));
      }
    }

    cloudSyncing.value = 'Синхронизация файлов…';
    await processQueue();

    console.log('✅ Полная синхронизация завершена');
    loadWeek(currentMonday.value);
  } catch (err) {
    console.error('❌ Ошибка полной синхронизации:', err);
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

// ---------- Инициализация и вход/выход ----------
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
      await fullSync();
      startTimers();
      loadWeek(currentMonday.value);
    } else {
      console.log('⏳ Токен истёк, пробую тихий вход…');
      const success = await trySilentLogin();
      if (success) {
        cloudEnabled.value = true;
        await fullSync();
        startTimers();
        loadWeek(currentMonday.value);
      }
    }
  }
}

async function enableCloudSync() {
  if (cloudEnabled.value) return;
  console.log('🔐 Запускаю процесс входа…');
  if (!isSignedIn.value) await signIn();
  cloudEnabled.value = true;
  console.log('✅ Вход выполнен, начинаю синхронизацию');
  await fullSync();
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

// ---------- Таймеры ----------
let fullSyncTimer = null;
let processTimer = null;

function startTimers() {
  stopTimers();
  fullSyncTimer = setInterval(fullSync, 10_000);
  processTimer = setInterval(processQueue, 2_000);
}
function stopTimers() {
  clearInterval(fullSyncTimer);
  clearInterval(processTimer);
}

// ---------- Экспорт ----------
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
    isInSync: computed(
      () =>
        cloudEnabled.value &&
        syncQueue.value.length === 0 &&
        !isProcessingQueue.value
    ),
    syncProgress: computed(() => {
      if (!cloudEnabled.value || syncQueue.value.length === 0) return 100;
      return Math.round(
        (1 - syncQueue.value.length / (syncQueue.value.length + 5)) * 100
      );
    }),
    initCloudSync,
    enableCloudSync,
    disableCloudSync,
    // Привычки
    habitDefs,
    getHabitDefs: () => habitDefs.value,
    addHabitDef: def => {
      if (!habitDefs.value.find(d => d.id === def.id)) {
        habitDefs.value.push(def);
        habitDefs.value = [...habitDefs.value];
      }
    },
    updateHabitDef: (id, changes) => {
      const def = habitDefs.value.find(d => d.id === id);
      if (def) {
        Object.assign(def, changes);
        habitDefs.value = [...habitDefs.value];
      }
    },
    removeHabitDef: id => {
      habitDefs.value = habitDefs.value.filter(d => d.id !== id);
    },
    getHabitValue,
    setHabitValue,
    markWeekDirty,
    enqueueFile,
    getWeekKey, // для HabitsDayColumn
  };
}
