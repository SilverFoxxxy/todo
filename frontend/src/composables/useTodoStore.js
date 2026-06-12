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

  delete weekData.value._lastModified;
  if (weekData.value._habits) {
    for (const dateStr of Object.keys(weekData.value._habits)) {
      if (
        Array.isArray(weekData.value._habits[dateStr]) &&
        weekData.value._habits[dateStr].length === 0
      ) {
        delete weekData.value._habits[dateStr];
      }
    }
  }
}

function cleanWeekData(data) {
  if (typeof data !== 'object' || data === null) return data;
  const cleaned = { ...data };
  delete cleaned._lastModified;
  delete cleaned._modifiedTime;
  for (const key of Object.keys(cleaned)) {
    if (key === '_habits') continue;
    if (Array.isArray(cleaned[key]) && cleaned[key].length === 0) {
      delete cleaned[key];
    }
  }
  if (
    cleaned._habits &&
    typeof cleaned._habits === 'object' &&
    !Array.isArray(cleaned._habits)
  ) {
    const habits = { ...cleaned._habits };
    for (const dateStr of Object.keys(habits)) {
      if (Array.isArray(habits[dateStr]) && habits[dateStr].length === 0) {
        delete habits[dateStr];
      }
    }
    if (Object.keys(habits).length > 0) {
      cleaned._habits = habits;
    } else {
      delete cleaned._habits;
    }
  }
  return cleaned;
}

function saveWeek() {
  const key = getWeekKey(currentMonday.value);
  const cleaned = cleanWeekData(weekData.value);
  localStorage.setItem(key, JSON.stringify(cleaned));
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
  enqueueFile(getWeekKey(new Date(dateStr)));
}

function updateTodo(dateStr, todoId, changes) {
  const todos = weekData.value[dateStr];
  if (!todos) return;
  const todo = todos.find(t => t.id === todoId);
  if (todo) Object.assign(todo, changes);
  enqueueFile(getWeekKey(new Date(dateStr)));
}

function deleteTodo(dateStr, todoId) {
  const todos = weekData.value[dateStr];
  if (!todos) return;
  weekData.value[dateStr] = todos.filter(t => t.id !== todoId);
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

// ---------- Облачные снимки ----------
const cloudEnabled = ref(false);
const cloudSyncing = ref('');
const isSyncing = ref(false);
const driveFileIds = reactive({});

function getCloudSnap(fileKey) {
  const raw = localStorage.getItem(`cloud-snap-${fileKey}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && '_modifiedTime' in parsed) {
      return parsed;
    }
  } catch {}
  return null;
}

function setCloudSnap(fileKey, data, modifiedTime) {
  const snap = { data, _modifiedTime: modifiedTime };
  localStorage.setItem(`cloud-snap-${fileKey}`, JSON.stringify(snap));
}

// ---------- Привычки ----------
const habitDefs = ref(loadHabitDefs());

function loadHabitDefs() {
  try {
    const raw = localStorage.getItem('habits-definitions');
    if (raw) {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch (e) {}
  return [];
}
function saveHabitDefs(defs) {
  localStorage.setItem('habits-definitions', JSON.stringify(defs));
}
let previousHabitDefsJson = JSON.stringify(habitDefs.value);
watch(
  habitDefs,
  newVal => {
    if (!Array.isArray(newVal)) {
      habitDefs.value = [];
      return;
    }
    saveHabitDefs(newVal);
    const newJson = JSON.stringify(newVal);
    if (newJson !== previousHabitDefsJson) {
      previousHabitDefsJson = newJson;
      enqueueFile('habits-definitions');
    }
  },
  { deep: true }
);

function setHabitValue(dateStr, habitId, value) {
  const habits = weekData.value._habits || {};
  let dayHabits = habits[dateStr] || [];

  if (value === null || value === '' || value === 0) {
    dayHabits = dayHabits.filter(h => h.habitId !== habitId);
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

  enqueueFile(getWeekKey(new Date(dateStr)));
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
    previousHabitDefsJson = JSON.stringify(habitDefs.value);
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
    const localTasks = Array.isArray(localObj?.[date]) ? localObj[date] : [];
    const cloudTasks = Array.isArray(cloudObj?.[date]) ? cloudObj[date] : [];
    const merged = new Map();
    for (const t of cloudTasks) merged.set(t.id, t);
    for (const t of localTasks) merged.set(t.id, t);
    result[date] = Array.from(merged.values());
  }
  const localHabits = localObj?._habits || {};
  const cloudHabits = cloudObj?._habits || {};
  result._habits = { ...cloudHabits, ...localHabits };
  return result;
}

// ---------- Очередь ----------
const syncQueue = ref([]);
const isProcessingQueue = ref(false);

function enqueueFile(fileName) {
  if (!cloudEnabled.value || !isSignedIn.value) return;
  const baseName = fileName.replace(/\.json$/, '');
  if (baseName.includes('NaN') || baseName === 'todo-week-unknown') return;
  if (!syncQueue.value.includes(baseName)) {
    syncQueue.value.push(baseName);
  }
}

async function processQueue() {
  if (isProcessingQueue.value || syncQueue.value.length === 0) return;
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
async function pushFileToCloud(fileKey, data) {
  if (!cloudEnabled.value || !isSignedIn.value) return null;
  const fileName = `${fileKey}.json`;
  try {
    let existingId = driveFileIds[fileKey];
    if (existingId) {
      const result = await uploadFile(fileName, data, existingId);
      return {
        modifiedTime: new Date(result.modifiedTime).getTime(),
        id: existingId,
      };
    }
    const result = await uploadFile(fileName, data);
    if (result?.id) {
      driveFileIds[fileKey] = result.id;
      return {
        modifiedTime: new Date(result.modifiedTime).getTime(),
        id: result.id,
      };
    }
    return null;
  } catch (e) {
    if (e.message?.includes('403')) return null;
    throw e;
  }
}

// ---------- Универсальная синхронизация файла ----------
async function syncFile(fileKey) {
  const isWeekFile = fileKey.startsWith('todo-week-');
  const isHabitsFile = fileKey === 'habits-definitions';

  const getLocalData = () => {
    if (isWeekFile) {
      const raw = localStorage.getItem(fileKey);
      return raw ? cleanWeekData(JSON.parse(raw)) : {};
    } else {
      return loadHabitDefs();
    }
  };

  const localData = getLocalData();
  const snap = getCloudSnap(fileKey);
  const cloudSnapData = snap ? snap.data : null;

  const dirty = snap
    ? isWeekFile
      ? JSON.stringify(cleanWeekData(localData)) !==
        JSON.stringify(cleanWeekData(cloudSnapData))
      : JSON.stringify(localData) !== JSON.stringify(cloudSnapData)
    : false;

  const saveLocal = data => {
    if (isWeekFile) {
      localStorage.setItem(fileKey, JSON.stringify(cleanWeekData(data)));
    } else {
      habitDefs.value = data;
      saveHabitDefs(data);
    }
  };

  const isCurrentWeek =
    isWeekFile && fileKey === getWeekKey(currentMonday.value);

  let cloudFile = null;
  try {
    const allFiles = await listWeekFiles();
    const targetName = `${fileKey}.json`;
    for (const f of allFiles) {
      const match = f.name.match(/^(todo-week-\d{4}-W\d{2})(?:-\d+)?\.json$/);
      if (isWeekFile && match) {
        const key = match[1];
        if (key === fileKey) {
          const t = new Date(f.modifiedTime).getTime();
          if (!cloudFile || t > new Date(cloudFile.modifiedTime).getTime())
            cloudFile = f;
        }
      } else if (isHabitsFile && f.name === targetName) {
        cloudFile = f;
        break;
      }
    }
  } catch (e) {}

  const cloudModified = cloudFile
    ? new Date(cloudFile.modifiedTime).getTime()
    : null;
  if (cloudFile && !driveFileIds[fileKey]) driveFileIds[fileKey] = cloudFile.id;

  // Случай 1: облачного файла нет
  if (!cloudFile) {
    if (dirty) {
      const result = await pushFileToCloud(fileKey, localData);
      if (result) setCloudSnap(fileKey, localData, result.modifiedTime);
    } else if (!snap) {
      setCloudSnap(fileKey, localData, 0);
    }
    return;
  }

  // Случай 2: первый запуск – нет снимка (НЕ ЗАТИРАЕМ ОБЛАКО ПУСТЫМ ФАЙЛОМ)
  if (!snap) {
    let cloudData;
    try {
      cloudData = await downloadFile(cloudFile.id);
    } catch (e) {
      return;
    }

    // Слияние локальных и облачных данных перед созданием снимка
    const merge = isWeekFile
      ? (local, cloud) => mergeWeekDays(local, cloud)
      : (local, cloud) => {
          const arr = Array.isArray(cloud) ? [...cloud] : [];
          for (const def of Array.isArray(local) ? local : []) {
            const idx = arr.findIndex(d => d.id === def.id);
            if (idx >= 0) arr[idx] = def;
            else arr.push(def);
          }
          return arr;
        };

    const merged = merge(localData, cloudData);
    saveLocal(merged);
    setCloudSnap(fileKey, merged, cloudModified);
    if (isCurrentWeek) loadWeek(currentMonday.value);
    return;
  }

  // Случай 3: облачный файл не менялся
  const savedCloudModified = snap._modifiedTime || 0;
  if (cloudModified === savedCloudModified) {
    if (dirty) {
      const result = await pushFileToCloud(fileKey, localData);
      if (result) {
        setCloudSnap(fileKey, localData, result.modifiedTime);
        if (isCurrentWeek) loadWeek(currentMonday.value);
      }
    }
    return;
  }

  // Случай 4: облачный файл изменился – слияние
  let cloudData;
  try {
    cloudData = await downloadFile(cloudFile.id);
  } catch (e) {
    return;
  }

  const merge = isWeekFile
    ? (local, cloud) => mergeWeekDays(local, cloud)
    : (local, cloud) => {
        const arr = Array.isArray(cloud) ? [...cloud] : [];
        for (const def of Array.isArray(local) ? local : []) {
          const idx = arr.findIndex(d => d.id === def.id);
          if (idx >= 0) arr[idx] = def;
          else arr.push(def);
        }
        return arr;
      };

  const merged = merge(localData, cloudData);

  if (!dirty || JSON.stringify(merged) === JSON.stringify(cloudData)) {
    saveLocal(cloudData);
    setCloudSnap(fileKey, cloudData, cloudModified);
    if (isCurrentWeek) loadWeek(currentMonday.value);
    return;
  }

  saveLocal(merged);
  const result = await pushFileToCloud(fileKey, merged);
  if (result) {
    setCloudSnap(fileKey, merged, result.modifiedTime);
  }
  if (isCurrentWeek) loadWeek(currentMonday.value);
}

// ---------- Полная синхронизация ----------
async function fullSync() {
  if (!cloudEnabled.value || !isSignedIn.value) return;
  isSyncing.value = true;
  cloudSyncing.value = 'Полная синхронизация…';
  try {
    const files = await listWeekFiles();

    const allFileKeys = new Set();
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith('todo-week-') && !key.startsWith('cloud-snap-')) {
        const raw = localStorage.getItem(key);
        if (raw) {
          try {
            const data = JSON.parse(raw);
            const hasContent =
              Object.keys(data).some(
                k => k !== '_habits' && data[k]?.length > 0
              ) ||
              (data._habits &&
                Object.values(data._habits).some(
                  day => Array.isArray(day) && day.length > 0
                ));
            if (hasContent) allFileKeys.add(key);
          } catch (e) {}
        }
      }
    }
    if (localStorage.getItem('habits-definitions'))
      allFileKeys.add('habits-definitions');

    const bestFiles = {};
    for (const file of files) {
      const match = file.name.match(
        /^(todo-week-\d{4}-W\d{2})(?:-\d+)?\.json$/
      );
      if (match) {
        const weekKey = match[1];
        const t = new Date(file.modifiedTime).getTime();
        if (!bestFiles[weekKey] || t > bestFiles[weekKey].time)
          bestFiles[weekKey] = { file, time: t };
        allFileKeys.add(weekKey);
      } else if (file.name === 'habits-definitions.json') {
        allFileKeys.add('habits-definitions');
        bestFiles['habits-definitions'] = {
          file,
          time: new Date(file.modifiedTime).getTime(),
        };
      }
    }

    for (const fileKey of allFileKeys) {
      const cloudInfo = bestFiles[fileKey];
      const cloudModified = cloudInfo ? cloudInfo.time : null;
      const snap = getCloudSnap(fileKey);
      const savedModified = snap ? snap._modifiedTime : 0;

      const localData =
        fileKey === 'habits-definitions'
          ? loadHabitDefs()
          : (() => {
              const raw = localStorage.getItem(fileKey);
              return raw ? cleanWeekData(JSON.parse(raw)) : {};
            })();

      const dirty = snap
        ? fileKey === 'habits-definitions'
          ? JSON.stringify(localData) !== JSON.stringify(snap.data)
          : JSON.stringify(cleanWeekData(localData)) !==
            JSON.stringify(cleanWeekData(snap.data))
        : false;

      if (!cloudInfo) {
        const isEmpty =
          fileKey === 'habits-definitions'
            ? localData.length === 0
            : Object.keys(localData).every(
                k =>
                  k === '_habits' ||
                  (Array.isArray(localData[k]) && localData[k].length === 0)
              );
        if (!isEmpty) enqueueFile(fileKey);
      } else if (!snap) {
        enqueueFile(fileKey);
      } else if (cloudModified !== savedModified || dirty) {
        enqueueFile(fileKey);
      }
    }

    cloudSyncing.value = 'Синхронизация файлов…';
    await processQueue();

    loadWeek(currentMonday.value);
  } catch (err) {
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
  initGoogleAuth();
  const storedToken = localStorage.getItem('google_token');
  const expires = localStorage.getItem('google_token_expires');
  if (storedToken && expires && Date.now() < parseInt(expires)) {
    accessToken.value = storedToken;
    isSignedIn.value = true;
    cloudEnabled.value = true;
    await fullSync();
    startTimers();
    loadWeek(currentMonday.value);
  }
}

async function enableCloudSync() {
  if (cloudEnabled.value) return;
  if (!isSignedIn.value) await signIn();
  cloudEnabled.value = true;
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
    enqueueFile,
    getWeekKey,
  };
}
