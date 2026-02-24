// Background Service Worker
const API_URL = 'http://192.168.5.70:3000'; // Change to your server URL
const DOCUMENT_IMPORT_DB_NAME = 'wt_document_imports';
const DOCUMENT_IMPORT_DB_VERSION = 1;
const DOCUMENT_IMPORT_META_STORE = 'imports_meta';
const DOCUMENT_IMPORT_CHUNK_STORE = 'imports_chunks';
const DOCUMENT_IMPORT_TTL_MS = 30 * 60 * 1000; // 30 minutes
const CONTEXT_MENU_TRANSLATE_DOCUMENT_ID = 'wt_translate_document';
let documentImportDbPromise = null;

function ensureContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: CONTEXT_MENU_TRANSLATE_DOCUMENT_ID,
      title: 'Перевести документ',
      contexts: ['page', 'link', 'selection'],
      documentUrlPatterns: ['https://web.whatsapp.com/*'],
    });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  ensureContextMenu();
});

chrome.runtime.onStartup.addListener(() => {
  ensureContextMenu();
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_TRANSLATE_DOCUMENT_ID) return;
  if (!tab?.id) return;

  try {
    await chrome.tabs.sendMessage(tab.id, {
      type: 'TRIGGER_DOCUMENT_IMPORT_FROM_CONTEXT_MENU',
      data: {
        linkUrl: info.linkUrl || '',
        srcUrl: info.srcUrl || '',
        selectionText: info.selectionText || '',
      },
    });
  } catch (error) {
    console.error('Failed to relay context-menu action to content script:', error);
  }
});

function makeImportId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function openDocumentImportDb() {
  if (documentImportDbPromise) return documentImportDbPromise;

  documentImportDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DOCUMENT_IMPORT_DB_NAME, DOCUMENT_IMPORT_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(DOCUMENT_IMPORT_META_STORE)) {
        db.createObjectStore(DOCUMENT_IMPORT_META_STORE, { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains(DOCUMENT_IMPORT_CHUNK_STORE)) {
        const chunkStore = db.createObjectStore(DOCUMENT_IMPORT_CHUNK_STORE, { keyPath: 'key' });
        chunkStore.createIndex('importId', 'importId', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open import DB'));
  });

  return documentImportDbPromise;
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
  });
}

function sanitizeImportMeta(meta) {
  if (!meta) return null;
  return {
    id: meta.id,
    fileName: meta.fileName,
    mimeType: meta.mimeType,
    size: meta.size,
    totalChunks: meta.totalChunks,
    receivedChunks: meta.receivedChunks,
    status: meta.status,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    completedAt: meta.completedAt || 0,
  };
}

async function saveDocumentImportMeta(metaRecord) {
  const db = await openDocumentImportDb();
  const tx = db.transaction([DOCUMENT_IMPORT_META_STORE], 'readwrite');
  tx.objectStore(DOCUMENT_IMPORT_META_STORE).put(metaRecord);
  await txDone(tx);
}

async function getDocumentImportMetaRecord(importId) {
  const db = await openDocumentImportDb();
  const tx = db.transaction([DOCUMENT_IMPORT_META_STORE], 'readonly');
  const request = tx.objectStore(DOCUMENT_IMPORT_META_STORE).get(importId);
  const result = await requestToPromise(request);
  await txDone(tx);
  return result || null;
}

async function appendDocumentImportChunk(importId, index, base64Chunk) {
  const db = await openDocumentImportDb();
  const key = `${importId}:${index}`;

  const chunkTx = db.transaction([DOCUMENT_IMPORT_CHUNK_STORE], 'readwrite');
  chunkTx.objectStore(DOCUMENT_IMPORT_CHUNK_STORE).put({
    key,
    importId,
    index,
    base64Chunk,
    createdAt: Date.now(),
  });
  await txDone(chunkTx);

  const meta = await getDocumentImportMetaRecord(importId);
  if (!meta) {
    throw new Error('Document import not found');
  }

  const updatedMeta = {
    ...meta,
    receivedChunks: Math.max(Number(meta.receivedChunks || 0), Number(index) + 1),
    updatedAt: Date.now(),
  };
  await saveDocumentImportMeta(updatedMeta);
  return sanitizeImportMeta(updatedMeta);
}

async function getDocumentImportChunk(importId, index) {
  const db = await openDocumentImportDb();
  const tx = db.transaction([DOCUMENT_IMPORT_CHUNK_STORE], 'readonly');
  const request = tx.objectStore(DOCUMENT_IMPORT_CHUNK_STORE).get(`${importId}:${index}`);
  const record = await requestToPromise(request);
  await txDone(tx);
  return record?.base64Chunk || null;
}

async function deleteDocumentImport(importId) {
  const db = await openDocumentImportDb();
  const tx = db.transaction([DOCUMENT_IMPORT_META_STORE, DOCUMENT_IMPORT_CHUNK_STORE], 'readwrite');
  const metaStore = tx.objectStore(DOCUMENT_IMPORT_META_STORE);
  const chunkStore = tx.objectStore(DOCUMENT_IMPORT_CHUNK_STORE);
  const chunkIndex = chunkStore.index('importId');

  metaStore.delete(importId);

  const keyRange = IDBKeyRange.only(importId);
  const cursorRequest = chunkIndex.openCursor(keyRange);
  cursorRequest.onsuccess = (event) => {
    const cursor = event.target.result;
    if (cursor) {
      chunkStore.delete(cursor.primaryKey);
      cursor.continue();
    }
  };

  await txDone(tx);
}

async function cleanupExpiredDocumentImports() {
  const db = await openDocumentImportDb();
  const now = Date.now();
  const expiredIds = [];

  const readTx = db.transaction([DOCUMENT_IMPORT_META_STORE], 'readonly');
  const metaStore = readTx.objectStore(DOCUMENT_IMPORT_META_STORE);
  const allRequest = metaStore.getAll();
  const allMeta = await requestToPromise(allRequest);
  await txDone(readTx);

  for (const meta of allMeta || []) {
    const updatedAt = Number(meta?.updatedAt || meta?.createdAt || 0);
    if (!updatedAt) continue;
    if (now - updatedAt > DOCUMENT_IMPORT_TTL_MS) {
      expiredIds.push(meta.id);
    }
  }

  for (const importId of expiredIds) {
    try {
      await deleteDocumentImport(importId);
    } catch (error) {
      console.warn('Failed to cleanup expired import:', importId, error);
    }
  }
}

// Token management
async function getTokens() {
  const result = await chrome.storage.local.get(['accessToken', 'refreshToken']);
  return result;
}

async function setTokens(accessToken, refreshToken) {
  await chrome.storage.local.set({ accessToken, refreshToken });
}

async function clearTokens() {
  await chrome.storage.local.remove(['accessToken', 'refreshToken', 'user']);
}

async function refreshAccessToken() {
  const { refreshToken } = await getTokens();
  if (!refreshToken) return null;

  try {
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (response.ok) {
      const data = await response.json();
      await setTokens(data.accessToken, data.refreshToken);
      return data.accessToken;
    } else {
      await clearTokens();
      return null;
    }
  } catch (error) {
    console.error('Token refresh failed:', error);
    return null;
  }
}

// API calls with auto-refresh
async function apiCall(path, options = {}) {
  let { accessToken } = await getTokens();

  const makeRequest = async (token) => {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return fetch(`${API_URL}${path}`, {
      ...options,
      headers,
    });
  };

  let response = await makeRequest(accessToken);

  // If unauthorized, try to refresh token
  if (response.status === 401) {
    accessToken = await refreshAccessToken();
    if (accessToken) {
      response = await makeRequest(accessToken);
    }
  }

  return response;
}

// Message handlers
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse);
  return true; // Keep channel open for async response
});

async function handleMessage(message, sender) {
  switch (message.type) {
    case 'LOGIN':
      return handleLogin(message.data);

    case 'LOGOUT':
      return handleLogout();

    case 'GET_AUTH_STATUS':
      return getAuthStatus();

    case 'TRANSLATE':
      return handleTranslate(message.data);

    case 'GET_SETTINGS':
      return getSettings();

    case 'SAVE_SETTINGS':
      return saveSettings(message.data);

    case 'GET_USAGE':
      return getUsage();

    case 'GET_LANGUAGES':
      return getLanguages();

    case 'UI_LANGUAGE_CHANGED':
      return handleUiLanguageChanged(message.lang);

    case 'TRANSLATE_BATCH':
      return handleTranslateBatch(message.data);

    case 'START_DOCUMENT_IMPORT':
      return handleStartDocumentImport(message.data);

    case 'APPEND_DOCUMENT_IMPORT_CHUNK':
      return handleAppendDocumentImportChunk(message.data);

    case 'COMPLETE_DOCUMENT_IMPORT':
      return handleCompleteDocumentImport(message.data);

    case 'OPEN_DOCUMENT_IMPORT_PAGE':
      return handleOpenDocumentImportPage(message.data);

    case 'GET_DOCUMENT_IMPORT_META':
      return handleGetDocumentImportMeta(message.data);

    case 'GET_DOCUMENT_IMPORT_CHUNK':
      return handleGetDocumentImportChunk(message.data);

    case 'CLEAR_DOCUMENT_IMPORT':
      return handleClearDocumentImport(message.data);

    default:
      return { error: 'Unknown message type' };
  }
}

async function handleLogin({ email, password }) {
  try {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (response.ok) {
      await setTokens(data.accessToken, data.refreshToken);
      await chrome.storage.local.set({ user: data.user });
      return { success: true, user: data.user };
    } else {
      return { success: false, error: data.error?.message || 'Login failed' };
    }
  } catch (error) {
    return { success: false, error: 'Connection failed' };
  }
}

async function handleLogout() {
  try {
    const { refreshToken } = await getTokens();
    if (refreshToken) {
      await apiCall('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      });
    }
  } catch (e) {}
  
  await clearTokens();
  return { success: true };
}

async function getAuthStatus() {
  const { accessToken, user } = await chrome.storage.local.get(['accessToken', 'user']);

  if (!accessToken) {
    return { authenticated: false };
  }

  // Verify token
  try {
    const response = await apiCall('/auth/me');

    if (response.ok) {
      const userData = await response.json();
      await chrome.storage.local.set({ user: userData });
      return { authenticated: true, user: userData };
    } else {
      await clearTokens();
      return { authenticated: false };
    }
  } catch (error) {
    return { authenticated: false };
  }
}

async function handleTranslate({ text, source, target, direction }) {
  try {
    const response = await apiCall('/translate', {
      method: 'POST',
      body: JSON.stringify({
        text,
        source: source || 'auto',
        target,
        context: { direction },
      }),
    });

    const data = await response.json();

    if (response.ok) {
      return { success: true, ...data };
    } else {
      return { success: false, error: data.error };
    }
  } catch (error) {
    return { success: false, error: 'Connection failed' };
  }
}

async function getSettings() {
  const result = await chrome.storage.local.get('settings');
  return result.settings || {
    autoTranslate: false,
    sourceLanguage: 'auto',
    targetLanguage: 'EN',
    sendTranslation: false,
    sendSourceLanguage: 'auto',
    sendTargetLanguage: 'EN',
    translationStyle: 'normal',
    skipSameLanguage: true,
    minMessageLength: 3,
    showFloatingWidget: true,
  };
}

async function saveSettings(settings) {
  await chrome.storage.local.set({ settings });
  // Notify content scripts
  const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, { type: 'SETTINGS_UPDATED', settings });
  }
  return { success: true };
}

async function handleUiLanguageChanged(lang) {
  await chrome.storage.local.set({ uiLanguage: lang });
  const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, { type: 'UI_LANGUAGE_CHANGED', lang });
  }
  return { success: true };
}

async function getUsage() {
  try {
    const response = await apiCall('/usage');
    if (response.ok) {
      return await response.json();
    }
    return null;
  } catch (error) {
    return null;
  }
}

async function handleTranslateBatch({ segments, source, target }) {
  try {
    const response = await apiCall('/translate/batch', {
      method: 'POST',
      body: JSON.stringify({ segments, source: source || 'auto', target }),
    });

    const data = await response.json();

    if (response.ok) {
      return { success: true, ...data };
    } else {
      return { success: false, error: data.error };
    }
  } catch (error) {
    return { success: false, error: 'Batch translation failed' };
  }
}

async function getLanguages() {
  try {
    const response = await fetch(`${API_URL}/languages`);
    if (response.ok) {
      const data = await response.json();
      return data.languages;
    }
  } catch (e) {}
  
  // Fallback
  return [
    { code: 'EN', name: 'English' },
    { code: 'RU', name: 'Russian' },
    { code: 'ES', name: 'Spanish' },
    { code: 'DE', name: 'German' },
    { code: 'FR', name: 'French' },
    { code: 'IT', name: 'Italian' },
    { code: 'PT', name: 'Portuguese' },
    { code: 'ZH', name: 'Chinese' },
    { code: 'JA', name: 'Japanese' },
    { code: 'KO', name: 'Korean' },
  ];
}

async function handleStartDocumentImport(data) {
  try {
    const fileName = String(data?.fileName || '').trim();
    const mimeType = String(data?.mimeType || '').trim();
    const size = Number(data?.size || 0);
    const totalChunks = Math.max(1, Number(data?.totalChunks || 1));

    if (!fileName) {
      return { success: false, error: { code: 'VALIDATION_ERROR', message: 'File name is required' } };
    }

    await cleanupExpiredDocumentImports();

    const now = Date.now();
    const importId = makeImportId();
    const metaRecord = {
      id: importId,
      fileName,
      mimeType,
      size: Number.isFinite(size) ? size : 0,
      totalChunks,
      receivedChunks: 0,
      status: 'receiving',
      createdAt: now,
      updatedAt: now,
      completedAt: 0,
    };

    await saveDocumentImportMeta(metaRecord);
    return { success: true, importId, meta: sanitizeImportMeta(metaRecord) };
  } catch (error) {
    console.error('START_DOCUMENT_IMPORT failed:', error);
    return { success: false, error: { code: 'IMPORT_START_FAILED', message: 'Failed to start document import' } };
  }
}

async function handleAppendDocumentImportChunk(data) {
  try {
    const importId = String(data?.importId || '').trim();
    const index = Number(data?.index);
    const base64Chunk = String(data?.base64Chunk || '');

    if (!importId || !Number.isInteger(index) || index < 0 || !base64Chunk) {
      return { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid chunk payload' } };
    }

    const meta = await appendDocumentImportChunk(importId, index, base64Chunk);
    return { success: true, meta };
  } catch (error) {
    console.error('APPEND_DOCUMENT_IMPORT_CHUNK failed:', error);
    return { success: false, error: { code: 'IMPORT_CHUNK_FAILED', message: 'Failed to append document chunk' } };
  }
}

async function handleCompleteDocumentImport(data) {
  try {
    const importId = String(data?.importId || '').trim();
    if (!importId) {
      return { success: false, error: { code: 'VALIDATION_ERROR', message: 'Import id is required' } };
    }

    const meta = await getDocumentImportMetaRecord(importId);
    if (!meta) {
      return { success: false, error: { code: 'NOT_FOUND', message: 'Document import not found' } };
    }

    const receivedChunks = Number(meta.receivedChunks || 0);
    const totalChunks = Math.max(1, Number(meta.totalChunks || 1));
    if (receivedChunks < totalChunks) {
      return {
        success: false,
        error: {
          code: 'IMPORT_INCOMPLETE',
          message: `Document import is incomplete (${receivedChunks}/${totalChunks})`,
        },
      };
    }

    const updatedMeta = {
      ...meta,
      status: 'ready',
      updatedAt: Date.now(),
      completedAt: Date.now(),
    };
    await saveDocumentImportMeta(updatedMeta);

    return { success: true, meta: sanitizeImportMeta(updatedMeta) };
  } catch (error) {
    console.error('COMPLETE_DOCUMENT_IMPORT failed:', error);
    return { success: false, error: { code: 'IMPORT_COMPLETE_FAILED', message: 'Failed to complete document import' } };
  }
}

async function handleOpenDocumentImportPage(data) {
  try {
    const importId = String(data?.importId || '').trim();
    if (!importId) {
      return { success: false, error: { code: 'VALIDATION_ERROR', message: 'Import id is required' } };
    }

    const url = chrome.runtime.getURL(`src/document/document.html?importId=${encodeURIComponent(importId)}`);
    const tab = await chrome.tabs.create({ url });
    return { success: true, tabId: tab?.id || null };
  } catch (error) {
    console.error('OPEN_DOCUMENT_IMPORT_PAGE failed:', error);
    return { success: false, error: { code: 'OPEN_PAGE_FAILED', message: 'Failed to open document page' } };
  }
}

async function handleGetDocumentImportMeta(data) {
  try {
    const importId = String(data?.importId || '').trim();
    if (!importId) {
      return { success: false, error: { code: 'VALIDATION_ERROR', message: 'Import id is required' } };
    }

    const meta = await getDocumentImportMetaRecord(importId);
    if (!meta) {
      return { success: false, error: { code: 'NOT_FOUND', message: 'Document import not found' } };
    }

    return { success: true, meta: sanitizeImportMeta(meta) };
  } catch (error) {
    console.error('GET_DOCUMENT_IMPORT_META failed:', error);
    return { success: false, error: { code: 'IMPORT_META_FAILED', message: 'Failed to load import metadata' } };
  }
}

async function handleGetDocumentImportChunk(data) {
  try {
    const importId = String(data?.importId || '').trim();
    const index = Number(data?.index);
    if (!importId || !Number.isInteger(index) || index < 0) {
      return { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid chunk request' } };
    }

    const base64Chunk = await getDocumentImportChunk(importId, index);
    if (!base64Chunk) {
      return { success: false, error: { code: 'NOT_FOUND', message: 'Chunk not found' } };
    }

    return { success: true, base64Chunk };
  } catch (error) {
    console.error('GET_DOCUMENT_IMPORT_CHUNK failed:', error);
    return { success: false, error: { code: 'IMPORT_CHUNK_READ_FAILED', message: 'Failed to load import chunk' } };
  }
}

async function handleClearDocumentImport(data) {
  try {
    const importId = String(data?.importId || '').trim();
    if (!importId) {
      return { success: false, error: { code: 'VALIDATION_ERROR', message: 'Import id is required' } };
    }

    await deleteDocumentImport(importId);
    return { success: true };
  } catch (error) {
    console.error('CLEAR_DOCUMENT_IMPORT failed:', error);
    return { success: false, error: { code: 'IMPORT_CLEAR_FAILED', message: 'Failed to clear document import' } };
  }
}
