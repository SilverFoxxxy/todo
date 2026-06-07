// src/composables/useGoogleDrive.js
import { ref, reactive } from 'vue';

const CLIENT_ID =
  '1042270247553-2767biib6g182ds08uhca6n75dbalfuf.apps.googleusercontent.com';
const API_KEY = 'ВАШ_API_KEY';
const APP_FOLDER_NAME = 'weekly-todo';

export const isSignedIn = ref(false);
export const accessToken = ref(null);

let tokenClient = null;

// Восстановление токена из localStorage при старте
function loadTokenFromStorage() {
  const stored = localStorage.getItem('google_token');
  const expires = localStorage.getItem('google_token_expires');
  if (stored && expires) {
    const expiryTime = parseInt(expires);
    if (Date.now() < expiryTime) {
      accessToken.value = stored;
      isSignedIn.value = true;
      return true;
    }
  }
  return false;
}

// Сохранение токена в localStorage
function saveTokenToStorage(token, expiresIn = 86400, scope = '') {
  const expiresAt = Date.now() + expiresIn * 1000;
  localStorage.setItem('google_token', token);
  localStorage.setItem('google_token_expires', expiresAt.toString());
  localStorage.setItem('google_token_scope', scope);
}

// Удаление токена
export function clearTokenStorage() {
  localStorage.removeItem('google_token');
  localStorage.removeItem('google_token_expires');
}

export function forceReauth() {
  return new Promise((resolve, reject) => {
    // Очищаем старый токен
    clearTokenStorage();
    accessToken.value = null;
    isSignedIn.value = false;

    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/drive', // полный доступ
      callback: response => {
        if (response.error) {
          reject(response.error);
        } else {
          accessToken.value = response.access_token;
          isSignedIn.value = true;
          saveTokenToStorage(
            response.access_token,
            response.expires_in || 3600,
            response.scope || '' // <-- сохраняем scope
          );
          resolve(response.access_token);
        }
      },
    });
    tokenClient.requestAccessToken({ prompt: 'consent' }); // обязательно consent, чтобы показать новые права
  });
}

// Инициализация Google Identity Services (без автоматического входа)
export function initGoogleAuth() {
  google.accounts.id.initialize({
    client_id: CLIENT_ID,
    callback: response => {
      if (response.error) {
        console.error('Google auth error:', response.error);
      } else {
        accessToken.value = response.access_token;
        isSignedIn.value = true;
        saveTokenToStorage(
          response.access_token,
          response.expires_in || 86400,
          response.scope || ''
        );
      }
    },
    // включаем автоматический вход (без показа окна)
    auto_select: true,
    prompt: '',
  });
}

// Тихий вход (без показа окна) – используется при перезагрузке
export function trySilentLogin() {
  return new Promise(resolve => {
    if (!tokenClient) {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/drive',
        callback: response => {
          if (response.error) {
            resolve(false);
          } else {
            accessToken.value = response.access_token;
            isSignedIn.value = true;
            saveTokenToStorage(
              response.access_token,
              response.expires_in || 3600,
              response.scope || '' // <-- сохраняем scope
            );
            resolve(true);
          }
        },
      });
    }
    tokenClient.requestAccessToken({ prompt: '' });
  });
}

// Полный вход (с показом окна)
export async function signIn() {
  return new Promise((resolve, reject) => {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/drive',
      callback: response => {
        if (response.error) {
          reject(response.error);
        } else {
          accessToken.value = response.access_token;
          isSignedIn.value = true;
          saveTokenToStorage(
            response.access_token,
            response.expires_in || 3600,
            response.scope || '' // <-- сохраняем scope
          );
          resolve(response.access_token);
        }
      },
    });
    tokenClient.requestAccessToken({ prompt: 'consent' });
  });
}

// Выход
export function signOut() {
  google.accounts.id.disableAutoSelect();
  accessToken.value = null;
  isSignedIn.value = false;
  clearTokenStorage();
}

// ==================== Работа с Google Диском ====================
// Остальные функции (getOrCreateFolder, listWeekFiles, downloadFile, uploadFile) без изменений,
// они используют accessToken.value

// В начало файла добавьте константу для ключа localStorage
const FOLDER_ID_KEY = 'todo-folder-id';

// Замените getOrCreateFolder на новую функцию getAppFolderId
async function getAppFolderId() {
  // 1. Пробуем найти сохранённый ID
  const storedId = localStorage.getItem(FOLDER_ID_KEY);
  if (storedId) {
    try {
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${storedId}?fields=id`,
        { headers: { Authorization: `Bearer ${accessToken.value}` } }
      );
      if (res.ok) return storedId; // папка существует
    } catch (e) {}
    // Если папка не найдена, удаляем сохранённый ID
    localStorage.removeItem(FOLDER_ID_KEY);
  }

  // 2. Ищем все папки с именем weekly-todo
  const query = `name='${APP_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,modifiedTime)`,
    { headers: { Authorization: `Bearer ${accessToken.value}` } }
  );
  const data = await res.json();
  const folders = data.files || [];

  // 3. Если папок несколько – выбираем самую свежую по времени изменения
  let folderId = null;
  if (folders.length > 0) {
    folders.sort((a, b) => new Date(b.modifiedTime) - new Date(a.modifiedTime));
    folderId = folders[0].id;
  } else {
    // 4. Если папок нет – создаём
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken.value}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: APP_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
      }),
    });
    const folder = await createRes.json();
    folderId = folder.id;
  }

  // 5. Запоминаем выбранный ID
  localStorage.setItem(FOLDER_ID_KEY, folderId);
  return folderId;
}

// Теперь listWeekFiles использует getAppFolderId
export async function listWeekFiles() {
  const folderId = await getAppFolderId();
  const query = `'${folderId}' in parents and trashed=false`;
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,modifiedTime)`,
    { headers: { Authorization: `Bearer ${accessToken.value}` } }
  );
  const data = await res.json();
  return data.files || [];
}

export async function downloadFile(fileId) {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    {
      headers: { Authorization: `Bearer ${accessToken.value}` },
    }
  );
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return await res.json();
}

export async function uploadFile(fileName, jsonData, existingFileId = null) {
  const folderId = await getAppFolderId(); // используем новую функцию получения папки

  const metadata = {
    name: fileName,
    mimeType: 'application/json',
  };
  if (!existingFileId) {
    metadata.parents = [folderId];
  }

  const fileContent = new Blob([JSON.stringify(jsonData, null, 2)], {
    type: 'application/json',
  });
  const form = new FormData();
  form.append(
    'metadata',
    new Blob([JSON.stringify(metadata)], { type: 'application/json' })
  );
  form.append('file', fileContent);

  const baseUrl = existingFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
  const url = `${baseUrl}&fields=id,name,modifiedTime`;

  const res = await fetch(url, {
    method: existingFileId ? 'PATCH' : 'POST',
    headers: { Authorization: `Bearer ${accessToken.value}` },
    body: form,
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(
      `Upload failed: ${res.status} ${JSON.stringify(errorData)}`
    );
  }
  const res_json = await res.json();
  console.log(res_json);
  return res_json;
}
