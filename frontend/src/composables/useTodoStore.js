import { ref, computed, watch, reactive } from 'vue';
import {
  isSignedIn,
  signIn,
  signOut,
  initGoogleAuth,
  getCloudFileInfo,
  listCloudFiles,
  downloadFile,
  uploadFile,
  accessToken,
} from './useGoogleDrive';
import { getMonday, getWeekKey, toDateStr } from '../utils/dateUtils';

// ---------- Вспомогательные функции ----------
const STATUSES = ['Planned', 'Postponed', 'Done', 'Cancelled', 'Caught Up'];

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
    } catch (e) {
      console.error('Ошибка парсинга недели:', e);
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

  habitDefs.value = loadHabitDefs();
}

const SERVICE_FIELDS = new Set([
  '_lastModified',
  '_modifiedTime',
  '_lastMod',
  '_modTime',
]);

function cleanFile(data) {
  if (data === null || data === undefined) {
    return undefined;
  }

  if (Array.isArray(data)) {
    const cleaned = [];

    for (let i = 0; i < data.length; i++) {
      const cleanedItem = cleanFile(data[i]);
      if (!isEmpty(cleanedItem)) {
        cleaned.push(cleanedItem);
      }
    }

    if (cleaned.length === 0) {
      return undefined;
    }

    return cleaned;
  }

  if (typeof data === 'object') {
    const cleaned = {};

    for (const key in data) {
      if (SERVICE_FIELDS.has(key)) {
        continue;
      }

      const cleanedValue = cleanFile(data[key]);
      if (!isEmpty(cleanedValue)) {
        cleaned[key] = cleanedValue;
      }
    }

    if (Object.keys(cleaned).length === 0) {
      return undefined;
    }

    return cleaned;
  }

  return data;
}

function isEmpty(value) {
  if (value === undefined) return true;
  if (value === null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

function saveWeek() {
  const key = getWeekKey(currentMonday.value);
  const cleaned = cleanFile(weekData.value);
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
  fullSync();
}

function updateTodo(dateStr, todoId, changes) {
  const todos = weekData.value[dateStr];
  if (!todos) return;
  const todo = todos.find(t => t.id === todoId);
  if (todo) Object.assign(todo, changes);
  fullSync();
}

function deleteTodo(dateStr, todoId) {
  const todos = weekData.value[dateStr];
  if (!todos) return;
  weekData.value[dateStr] = todos.filter(t => t.id !== todoId);
  fullSync();
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
    } catch (e) {
      console.error('Ошибка парсинга статусов:', e);
    }
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
  } catch (e) {
    console.error('getCloudSnap error:', e);
  }
  return null;
}

function setCloudSnap(fileKey, data, modifiedTime) {
  const cleanedData = cleanFile(data);
  const snap = { data: cleanedData, _modifiedTime: modifiedTime };
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
  } catch (e) {
    console.error('Ошибка парсинга снимка:', e);
  }
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
      fullSync();
    }
  },
  { deep: true }
);

function setHabitValue(dateStr, habitId, value) {
  const habits = weekData.value._habits || {};
  let dayHabits = habits[dateStr] || [];

  if (value === null) {
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

  fullSync();
}

function getHabitValue(dateStr, habitId) {
  const arr = weekData.value._habits?.[dateStr] || [];
  return arr.find(h => h.habitId === habitId)?.value ?? null;
}

function updateHabit(date, habitId, updates) {
  const def = habitDefs.value.find(d => d.id === habitId);
  if (!def) return;

  const { name, type } = updates;
  const newName = name?.trim();

  const nameChanged = newName && newName !== def.name;
  const typeChanged = type && type !== def.type;

  if (!nameChanged && !typeChanged) return;

  const finalName = newName || def.name;
  const finalType = type || def.type;

  // Ищем существующее определение
  const existingDef = habitDefs.value.find(
    d =>
      d.name.toLowerCase() === finalName.toLowerCase() && d.type === finalType
  );

  const newDefId = existingDef?.id || crypto.randomUUID();

  // Обновляем привычку в неделе
  const habits = weekData.value._habits || {};
  const dayHabits = habits[date] || [];
  const oldIndex = dayHabits.findIndex(h => h.habitId === habitId);

  if (oldIndex !== -1) {
    const newDayHabits = [...dayHabits];
    newDayHabits[oldIndex] = {
      habitId: newDefId,
      value: dayHabits[oldIndex].value,
    };

    if (typeChanged) {
      const defaultValue =
        type === 'boolean' ? true : type === 'number' ? 0 : '';
      newDayHabits[oldIndex].value = defaultValue;
    }

    weekData.value._habits = {
      ...habits,
      [date]: newDayHabits,
    };
  }

  // Создаём определение (если его не было)
  if (!existingDef) {
    addHabitDef({
      ...def,
      id: newDefId,
      name: finalName,
      type: finalType,
    });
  }
}

function cleanupUnusedHabitDefs() {
  const usedIds = new Set();

  // Собираем ID всех используемых привычек
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key.startsWith('todo-week-')) continue;

    try {
      const data = JSON.parse(localStorage.getItem(key));
      if (data._habits) {
        for (const day of Object.values(data._habits)) {
          if (Array.isArray(day)) {
            day.forEach(habit => usedIds.add(habit.habitId));
          }
        }
      }
    } catch (e) {
      console.error(`Ошибка при очистке ${key}`, e);
    }
  }

  // Фильтруем определения
  const defs = Array.isArray(habitDefs.value) ? habitDefs.value : [];
  const filtered = defs.filter(def => usedIds.has(def.id));

  const removedCount = defs.length - filtered.length;

  if (removedCount > 0) {
    const removed = defs.filter(def => !usedIds.has(def.id));
    console.warn(
      `🧹 [cleanup] удалено определений: ${removedCount}`,
      removed.map(d => d.name)
    );

    habitDefs.value = filtered;
    saveHabitDefs(filtered);
  }

  return removedCount;
}

// ---------- Слияние ----------
function mergeWeekDays(localObj, cloudObj) {
  const result = {};
  const allDates = new Set([
    ...Object.keys(cloudObj || {}),
    ...Object.keys(localObj || {}),
  ]);

  for (const date of allDates) {
    if (date === '_habits') continue;

    const localTasks = localObj?.[date] || [];
    const cloudTasks = cloudObj?.[date] || [];
    const merged = new Map();

    // Облачные приоритетнее
    for (const task of localTasks) merged.set(task.id, task);
    for (const task of cloudTasks) merged.set(task.id, task); // перезаписывают локальные

    result[date] = Array.from(merged.values());
  }

  // Обработка привычек (облачные приоритетнее, но не теряем ни одну)
  const localHabits = localObj?._habits || {};
  const cloudHabits = cloudObj?._habits || {};
  const mergedHabits = {};

  const allHabitDates = new Set([
    ...Object.keys(localHabits),
    ...Object.keys(cloudHabits),
  ]);

  for (const date of allHabitDates) {
    const localDayHabits = localHabits[date] || [];
    const cloudDayHabits = cloudHabits[date] || [];

    // Объединяем массивы, но при конфликте (одинаковый habitId) облачный приоритетнее
    const habitsMap = new Map();

    // Сначала локальные
    for (const habit of localDayHabits) {
      habitsMap.set(habit.habitId, habit);
    }
    // Потом облачные перезаписывают (если habitId совпадает)
    for (const habit of cloudDayHabits) {
      habitsMap.set(habit.habitId, habit);
    }

    // ВАЖНО: habitsMap теперь содержит уникальные habitId
    // Если habitId разные - оба останутся
    mergedHabits[date] = Array.from(habitsMap.values());
  }

  result._habits = mergedHabits;

  return cleanFile(result);
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

const totalFilesToSync = ref(0);
const syncedFilesCount = ref(0);

const syncProgress = computed(() => {
  if (!cloudEnabled.value) return 100;

  const total = totalFilesToSync.value + syncQueue.value.length;
  const synced = syncedFilesCount.value;

  if (total === 0) return 100;
  return Math.round((synced / total) * 100);
});

async function processQueue() {
  if (isProcessingQueue.value || syncQueue.value.length === 0) return;
  isProcessingQueue.value = true;

  try {
    const CONCURRENT = 5;

    // Берём текущую очередь и очищаем её
    const queueToProcess = [...syncQueue.value];
    console.log('queue:', queueToProcess);
    totalFilesToSync.value = queueToProcess.length;
    syncedFilesCount.value = 0;
    syncQueue.value = [];

    // Обрабатываем пачками
    for (let i = 0; i < queueToProcess.length; i += CONCURRENT) {
      const batch = queueToProcess.slice(i, i + CONCURRENT);
      await Promise.all(batch.map(fileName => syncFile(fileName)));
      syncedFilesCount.value += batch.length;
      console.log(totalFilesToSync.value);
      console.log(syncedFilesCount.value);
    }
  } catch (err) {
    console.error('Ошибка в processQueue:', err);
  } finally {
    isProcessingQueue.value = false;
    totalFilesToSync.value = 0;
    syncedFilesCount.value = 0;
  }
}

// ---------- Отправка файла ----------
async function pushFileToCloud(fileKey, data, existingFileId = null) {
  if (!cloudEnabled.value || !isSignedIn.value) return null;

  const fileName = `${fileKey}.json`;

  // Используем переданный ID, если есть
  let fileId = existingFileId || driveFileIds[fileKey];

  try {
    let result;
    if (fileId) {
      result = await uploadFile(fileName, data, fileId);
    } else {
      result = await uploadFile(fileName, data);
      if (result?.id) {
        driveFileIds[fileKey] = result.id;
      }
    }

    if (result) {
      return {
        modifiedTime: new Date(result.modifiedTime).getTime(),
        id: result.id,
      };
    }
    return null;
  } catch (e) {
    console.error('Ошибка загрузки:', e);
    return null;
  }
}

// Единая функция загрузки локальных данных
function loadLocalData(fileKey) {
  const raw = localStorage.getItem(fileKey);
  if (!raw) return {};

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.error(`Ошибка JSON.parse для ${fileKey}:`, e);
    localStorage.removeItem(fileKey);
    return {};
  }

  try {
    const cleaned = cleanFile(parsed);
    return cleaned ?? {};
  } catch (e) {
    console.error(`Ошибка cleanFile для ${fileKey}:`, e);
    return {};
  }
}

// Единая функция сохранения локальных данных
function saveLocalData(fileKey, data) {
  const cleanedData = cleanFile(data);
  localStorage.setItem(fileKey, JSON.stringify(cleanedData));
}

// Функция слияния для разных типов файлов
function mergeData(fileKey, localData, cloudData) {
  const isWeekFile = fileKey.startsWith('todo-week-');

  if (isWeekFile) {
    return mergeWeekDays(localData, cloudData);
  }

  // Для habits-definitions и других файлов
  const local = Array.isArray(localData) ? localData : [];
  const cloud = Array.isArray(cloudData) ? cloudData : [];
  const merged = [...cloud];

  for (const item of local) {
    const index = merged.findIndex(existing => existing.id === item.id);

    if (index >= 0) {
      merged[index] = item; // локальное перезаписывает облачное
    } else {
      merged.push(item);
    }
  }

  return merged;
}

// Проверка, нужно ли обновлять локальные данные
function shouldUpdateLocal(mergedData, cloudData) {
  return JSON.stringify(mergedData) === JSON.stringify(cloudData);
}

async function syncFile(fileKey) {
  const isWeekFile = fileKey.startsWith('todo-week-');
  const isCurrentWeek =
    isWeekFile && fileKey === getWeekKey(currentMonday.value);

  console.log(`🔄 Синхронизация: ${fileKey}`);

  // 1. Получаем актуальный облачный файл (информация + содержимое)
  const cloudFileInfo = await getCloudFileInfo(fileKey);
  let cloudData = null;
  let cloudModified = null;

  if (cloudFileInfo) {
    try {
      cloudData = await downloadFile(cloudFileInfo.id);
      cloudData = cleanFile(cloudData);
      cloudModified = new Date(cloudFileInfo.modifiedTime).getTime();
    } catch (error) {
      console.warn(`   ⚠️ Не удалось скачать ${fileKey}.json`, error);
      return;
    }
  }

  // 2. Загружаем локальные данные (синхронно)
  const localData = loadLocalData(fileKey);
  const snap = getCloudSnap(fileKey);
  const savedModified = snap?._modifiedTime ?? 0;
  const isLocalDirty = snap
    ? isDirty(localData, snap.data)
    : Object.keys(localData).length > 0;

  // 3. Определяем стратегию
  const hasCloudFile = !!cloudFileInfo;

  console.log(`   Параметры для стратегии:`, {
    hasCloudFile,
    cloudModified,
    savedModified,
    isLocalDirty,
    localDataLength: Array.isArray(localData)
      ? localData.length
      : Object.keys(localData).length,
    localData,
    snap,
    cloudData,
  });

  const strategy = determineSyncStrategy({
    hasCloudFile,
    cloudModified,
    savedModified,
    isLocalDirty,
  });

  console.log(`   Стратегия: ${strategy.type}`);

  // 4. Выполняем стратегию
  if (strategy.type === STRATEGY.UPLOAD) {
    // Только загрузка в облако (локальные данные уже актуальны)
    const result = await pushFileToCloud(fileKey, localData, cloudFileInfo?.id);
    if (result) {
      console.log(
        `   ✅ Обновляем снимок: modifiedTime = ${result.modifiedTime}`
      );
      setCloudSnap(fileKey, localData, result.modifiedTime);
    } else {
      console.log(`   ⚠️ Ошибка загрузки, снимок НЕ обновлён`);
    }
  } else if (strategy.type === STRATEGY.DOWNLOAD) {
    // Просто заменяем локальные данные облачными
    saveLocalData(fileKey, cloudData);
    setCloudSnap(fileKey, cloudData, cloudModified);

    loadWeek(currentMonday.value);
  } else if (strategy.type === STRATEGY.MERGE_AND_UPLOAD) {
    // Слияние: объединяем локальные и облачные данные
    const mergedData = mergeData(fileKey, localData, cloudData);
    const cleanedMergedData = cleanFile(mergedData);

    console.dir(localData);
    console.dir(cloudData);
    console.dir(cleanedMergedData);

    // Сохраняем локально результат слияния
    saveLocalData(fileKey, cleanedMergedData);

    // Загружаем в облако
    const result = await pushFileToCloud(
      fileKey,
      cleanedMergedData,
      cloudFileInfo?.id
    );
    if (result) {
      setCloudSnap(fileKey, cleanedMergedData, result.modifiedTime);
    }

    loadWeek(currentMonday.value);
  }

  // STRATEGY.NO_ACTION - ничего не делаем
}

// Стратегии синхронизации
const STRATEGY = {
  UPLOAD: 'upload', // только загрузить в облако
  DOWNLOAD: 'download', // только скачать из облака
  MERGE_AND_UPLOAD: 'merge-and-upload', // скачать, слить, загрузить результат
  NO_ACTION: 'no-action', // ничего не делать
};

function determineSyncStrategy({
  hasCloudFile,
  cloudModified,
  savedModified, // 0 если нет снимка
  isLocalDirty,
}) {
  // Нет облачного файла
  if (!hasCloudFile) {
    if (isLocalDirty) {
      return { type: STRATEGY.UPLOAD };
    }
    return { type: STRATEGY.NO_ACTION };
  }

  // Есть облачный файл
  const cloudChanged = cloudModified !== savedModified; // если savedModified=0, то cloudChanged = true

  if (!cloudChanged && !isLocalDirty) {
    return { type: STRATEGY.NO_ACTION };
  }

  if (!cloudChanged && isLocalDirty) {
    return { type: STRATEGY.UPLOAD };
  }

  if (cloudChanged && !isLocalDirty) {
    return { type: STRATEGY.DOWNLOAD };
  }

  // cloudChanged && isLocalDirty - конфликт
  return { type: STRATEGY.MERGE_AND_UPLOAD };
}

// Функция проверки на изменения (упрощённая)
function isDirty(localData, snapData) {
  const cleanedLocal = cleanFile(localData);
  const cleanedSnap = cleanFile(snapData);

  return JSON.stringify(cleanedLocal) !== JSON.stringify(cleanedSnap);
}

// ---------- Полная синхронизация ----------
async function fullSync() {
  try {
    cleanupUnusedHabitDefs();
    console.log(
      'try full Sync',
      cloudEnabled.value,
      isSignedIn.value,
      isSyncing.value
    );
    if (!cloudEnabled.value || !isSignedIn.value || isSyncing.value) return;
    isSyncing.value = true;
    cloudSyncing.value = 'Полная синхронизация…';
    const allFileKeys = new Set();
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith('todo-week-') && !key.startsWith('cloud-snap-')) {
        try {
          const data = loadLocalData(key);
          if (!data) continue;
          const hasContent =
            Object.keys(data).some(
              k => k !== '_habits' && data[k]?.length > 0
            ) ||
            (data._habits &&
              Object.values(data._habits).some(
                day => Array.isArray(day) && day.length > 0
              ));
          if (hasContent) allFileKeys.add(key);
        } catch (e) {
          console.error('Ошибка при загрузке недели:', e);
        }
      }
    }
    if (localStorage.getItem('habits-definitions'))
      allFileKeys.add('habits-definitions');

    console.log(allFileKeys);

    const cloudFilesList = await listCloudFiles();

    console.log(cloudFilesList);

    const bestFiles = {};
    for (const file of cloudFilesList) {
      // Определяем fileKey по имени файла
      let fileKey = null;
      const weekMatch = file.name.match(
        /^(todo-week-\d{4}-W\d{2})(?:-\d+)?\.json$/
      );
      if (weekMatch) {
        fileKey = weekMatch[1];
      } else if (file.name === 'habits-definitions.json') {
        fileKey = 'habits-definitions';
      }
      if (!fileKey) continue;

      const t = new Date(file.modifiedTime).getTime();
      if (!bestFiles[fileKey] || t > bestFiles[fileKey].time) {
        bestFiles[fileKey] = { file, time: t };
      }
      allFileKeys.add(fileKey);
    }

    console.log('all keys', allFileKeys);

    // Основной цикл синхронизации
    for (const fileKey of allFileKeys) {
      const cloudInfo = bestFiles[fileKey];
      const cloudModified = cloudInfo ? cloudInfo.time : null;
      const snap = getCloudSnap(fileKey);
      const savedModified = snap ? snap._modifiedTime : 0;

      const localData = loadLocalData(fileKey);
      const isEmptyLocal = !localData || Object.keys(localData).length === 0;
      const isLocalDirty = snap ? isDirty(localData, snap.data) : !isEmptyLocal;

      const strategy = determineSyncStrategy({
        hasCloudFile: !!cloudInfo,
        cloudModified,
        savedModified,
        isLocalDirty,
        isEmptyLocal,
      });

      if (strategy.type !== 'no-action') {
        enqueueFile(fileKey);
      }
    }

    cloudSyncing.value = 'Синхронизация файлов…';
    await processQueue();
  } catch (err) {
    console.error('Ошибка в fullSync:', err);
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
  processTimer = setInterval(processQueue, 5_000);
}
function stopTimers() {
  clearInterval(fullSyncTimer);
  clearInterval(processTimer);
}

// ---------- Экспорт ----------
loadWeek(currentMonday.value);

// ---------- Функции для привычек ----------
function getHabitDefs() {
  return habitDefs.value;
}

function addHabitDef(def) {
  if (!habitDefs.value.find(d => d.id === def.id)) {
    habitDefs.value.push(def);
    habitDefs.value = [...habitDefs.value];
  }
}

function updateHabitDef(id, changes) {
  const def = habitDefs.value.find(d => d.id === id);
  if (def) {
    Object.assign(def, changes);
    habitDefs.value = [...habitDefs.value];
  }
}

function removeHabitDef(id) {
  habitDefs.value = habitDefs.value.filter(d => d.id !== id);
}

// ---------- Computed свойства ----------
const isInSync = computed(
  () =>
    cloudEnabled.value &&
    syncQueue.value.length === 0 &&
    !isProcessingQueue.value
);

// ---------- Return ----------
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
    isInSync,
    syncProgress,
    initCloudSync,
    enableCloudSync,
    disableCloudSync,
    // Привычки
    habitDefs,
    getHabitDefs,
    addHabitDef,
    updateHabitDef,
    removeHabitDef,
    getHabitValue,
    setHabitValue,
    updateHabit,
    getWeekKey,
  };
}
