// Document Translation page script

// ===== i18n =====
const i18n = {
  en: {
    docPageTitle: 'Document Translation',
    loading: 'Loading...',
    authRequired: 'Authorization Required',
    authMessage: 'Please log in through the extension popup to use document translation.',
    authStep1: '1. Click the WhatsApp Translator extension icon in the toolbar',
    authStep2: '2. Enter your email and password',
    authStep3: '3. Return to this page and refresh',
    docSourceLang: 'From language',
    docTargetLang: 'To language',
    docAutoDetect: 'Auto Detect',
    docSwapLangs: 'Swap languages',
    docDropZoneTitle: 'Drop files here',
    docDropZoneOr: 'or',
    docDropZoneBtn: 'Select files',
    docDropZoneFormats: 'Supported formats: .xlsx, .docx, .pdf',
    docUnsupportedFormat: 'Unsupported format',
    docFileTooLarge: 'File too large (max 50MB)',
    docNoTextLayer: 'PDF has no text layer. Cannot be translated.',
    docSheets: 'Sheets',
    docPages: 'Pages',
    docLineByLine: 'Line-by-line translation (for tables and lists)',
    docSelectAll: 'Select all',
    docDeselectAll: 'Deselect all',
    docTranslateBtn: 'Translate ({count} files, ~{chars} chars)',
    docTranslateBtnNoFiles: 'Translate',
    docTranslating: 'Translating...',
    docLimitWarning: 'Translation may exceed your character limit.',
    docLimitRemaining: 'Remaining: {remaining} chars. Required: ~{required} chars.',
    docContinue: 'Continue anyway',
    docCancel: 'Cancel',
    docRemoveFile: 'Remove file',
    docSwapAutoTip: 'Cannot swap when source is Auto Detect',
    docParsing: 'Parsing file...',
    docTranslatingProgress: 'Translating... {percent}%',
    docRebuilding: 'Rebuilding file...',
    docDone: 'Done',
    docError: 'Error',
    docPartial: 'Partial',
    docWaiting: 'Waiting...',
    docOverallProgress: 'Translation: {current} of {total} files',
    docLimitExceeded: 'Character limit exceeded. {translated} of {total} segments translated.',
    docDownloadPartial: 'Download partial result',
    docRetry: 'Retry',
    docContactAdmin: 'Contact your administrator',
    docProviderNotConfigured: 'Translation service is not configured.',
    docResults: 'Translation results: {count} files, {chars} chars',
    docDownload: 'Download',
    docDownloadAll: 'Download all',
    docDownloaded: 'Downloaded!',
    docCreatingArchive: 'Creating archive...',
    docArchiveProgress: 'Archiving... {percent}%',
    docNoFilesToDownload: 'No files to download',
    docNewTranslation: 'New translation',
    docBack: 'Back',
    docPage: 'Page {n}',
    docStatusDone: 'Done',
    docStatusError: 'Error',
    docStatusPartial: 'Partial',
    docPreviewTitle: 'Preview: {fileName}',
    docOriginalName: 'Original: {name}',
    docNoPreviewData: 'No preview data available.',
    docPartialTranslated: 'Translated: {translated}/{total}',
    docNoFilesTranslated: 'No translated files yet.',
    docStatusCancelled: 'Cancelled',
    docSheet: 'Sheet',
    docPreviewError: 'Cannot build preview for this file.',
    docPreviewTruncated: 'Showing first {rows} rows and {cols} columns.',
    docEmptyFile: 'File is empty, nothing to translate',
    docNoTextContent: 'No text content to translate',
    docLargeFileWarning: 'Large file. Translation may take a while.',
    docCloseWarning: 'Translation is in progress. Are you sure you want to leave?',
    docFileAdded: 'File added',
    docConnectionLost: 'Connection lost. Retrying...',
    docLargeFileProcessing: 'Processing large file...',
    docSegmentProgress: 'Segment {current} of {total}',
    docImportingFromChat: 'Loading document from chat...',
    docImportFailed: 'Failed to load document from chat',
  },
  ru: {
    docPageTitle: 'Перевод документов',
    loading: 'Загрузка...',
    authRequired: 'Требуется авторизация',
    authMessage: 'Пожалуйста, авторизуйтесь через popup расширения для использования перевода документов.',
    authStep1: '1. Нажмите на иконку расширения WhatsApp Translator на панели инструментов',
    authStep2: '2. Введите email и пароль',
    authStep3: '3. Вернитесь на эту страницу и обновите её',
    docSourceLang: 'Язык оригинала',
    docTargetLang: 'Язык перевода',
    docAutoDetect: 'Автоопределение',
    docSwapLangs: 'Поменять местами',
    docDropZoneTitle: 'Перетащите файлы сюда',
    docDropZoneOr: 'или',
    docDropZoneBtn: 'Выбрать файлы',
    docDropZoneFormats: 'Поддерживаемые форматы: .xlsx, .docx, .pdf',
    docUnsupportedFormat: 'Формат не поддерживается',
    docFileTooLarge: 'Файл слишком большой (макс. 50MB)',
    docNoTextLayer: 'В PDF отсутствует текстовый слой. Перевод невозможен.',
    docSheets: 'Листы',
    docPages: 'Страницы',
    docLineByLine: 'Построчный перевод (для таблиц и списков)',
    docSelectAll: 'Выбрать все',
    docDeselectAll: 'Снять все',
    docTranslateBtn: 'Перевести ({count} файлов, ~{chars} симв.)',
    docTranslateBtnNoFiles: 'Перевести',
    docTranslating: 'Переводится...',
    docLimitWarning: 'Перевод может превысить ваш лимит символов.',
    docLimitRemaining: 'Осталось: {remaining} симв. Требуется: ~{required} симв.',
    docContinue: 'Продолжить',
    docCancel: 'Отмена',
    docRemoveFile: 'Удалить файл',
    docSwapAutoTip: 'Нельзя поменять, когда выбрано «Автоопределение»',
    docParsing: 'Анализ файла...',
    docTranslatingProgress: 'Перевод... {percent}%',
    docRebuilding: 'Сборка файла...',
    docDone: 'Готово',
    docError: 'Ошибка',
    docPartial: 'Частично',
    docWaiting: 'Ожидание...',
    docOverallProgress: 'Перевод: {current} из {total} файлов',
    docLimitExceeded: 'Лимит символов превышен. Переведено {translated} из {total} сегментов.',
    docDownloadPartial: 'Скачать частичный результат',
    docRetry: 'Повторить',
    docContactAdmin: 'Свяжитесь с администратором',
    docProviderNotConfigured: 'Сервис перевода не настроен.',
    docResults: 'Результаты перевода: {count} файлов, {chars} символов',
    docDownload: 'Скачать',
    docDownloadAll: 'Скачать все',
    docDownloaded: 'Скачано!',
    docCreatingArchive: 'Создание архива...',
    docArchiveProgress: 'Архивирование... {percent}%',
    docNoFilesToDownload: 'Нет файлов для скачивания',
    docNewTranslation: 'Новый перевод',
    docBack: 'Назад',
    docPage: 'Страница {n}',
    docStatusDone: 'Готово',
    docStatusError: 'Ошибка',
    docStatusPartial: 'Частично',
    docPreviewTitle: 'Предпросмотр: {fileName}',
    docOriginalName: 'Оригинал: {name}',
    docNoPreviewData: 'Нет данных для предпросмотра.',
    docPartialTranslated: 'Переведено: {translated}/{total}',
    docNoFilesTranslated: 'Пока нет переведенных файлов.',
    docStatusCancelled: 'Отменено',
    docSheet: 'Лист',
    docPreviewError: 'Не удалось построить предпросмотр этого файла.',
    docPreviewTruncated: 'Показаны первые {rows} строк и {cols} столбцов.',
    docEmptyFile: 'Файл пуст, нечего переводить',
    docNoTextContent: 'Нет текстового содержимого для перевода',
    docLargeFileWarning: 'Большой файл. Перевод может занять время.',
    docCloseWarning: 'Перевод в процессе. Вы уверены, что хотите уйти?',
    docFileAdded: 'Файл добавлен',
    docConnectionLost: 'Соединение потеряно. Повторная попытка...',
    docLargeFileProcessing: 'Обработка большого файла...',
    docSegmentProgress: 'Сегмент {current} из {total}',
    docImportingFromChat: 'Загрузка документа из чата...',
    docImportFailed: 'Не удалось загрузить документ из чата',
  },
};

let currentLang = 'en';
let languages = [];

// Uploaded files state: { id, file, status, error, parseResult, selectedSheets }
let uploadedFiles = [];
let fileIdCounter = 0;
let isTranslating = false;
let translationManager = null;
let translatedJobs = [];
let currentView = 'upload';
let currentPreviewFileId = null;
let currentPreviewSheet = '';
let isArchiveDownloadInProgress = false;
let globalHandlersBound = false;
let lastConnectionToastAt = 0;
let consumedImportId = '';

function t(key) {
  return i18n[currentLang]?.[key] || i18n.en[key] || key;
}

function tf(key, params = {}) {
  let value = t(key);
  for (const [name, replacement] of Object.entries(params)) {
    value = value.replace(`{${name}}`, String(replacement));
  }
  return value;
}

function applyLanguage(lang) {
  currentLang = lang;
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key);
  });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const key = el.getAttribute('data-i18n-title');
    el.title = t(key);
  });
  document.querySelectorAll('.lang-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });
  document.documentElement.lang = lang;
  // Re-render dynamic UI
  renderFileList();
  updateTranslateButton();
  updateOverallProgressUI();
  renderResultsView();
  renderPreviewView();
}

// ===== Messaging =====
async function sendMessage(message) {
  return chrome.runtime.sendMessage(message);
}

// ===== Helpers =====
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatNumber(num) {
  const locale = currentLang === 'ru' ? 'ru-RU' : 'en-US';
  return Number(num || 0).toLocaleString(locale);
}

function getImportIdFromLocation() {
  try {
    const params = new URLSearchParams(window.location.search || '');
    const importId = params.get('importId') || '';
    return String(importId).trim();
  } catch {
    return '';
  }
}

function clearImportIdFromLocation() {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('importId')) return;
    url.searchParams.delete('importId');

    const queryString = url.searchParams.toString();
    const nextUrl = queryString ? `${url.pathname}?${queryString}${url.hash}` : `${url.pathname}${url.hash}`;
    window.history.replaceState({}, document.title, nextUrl);
  } catch {}
}

async function preloadImportedDocumentFromQuery() {
  const importId = getImportIdFromLocation();
  if (!importId || importId === consumedImportId) return;

  consumedImportId = importId;
  showNotification(t('docImportingFromChat'), 'info');

  try {
    const meta = await waitForDocumentImportMeta(importId, 24, 300);
    if (!meta) {
      throw new Error('IMPORT_META_NOT_FOUND');
    }

    const file = await buildFileFromImportedChunks(importId, meta);
    if (!file) {
      throw new Error('IMPORT_FILE_BUILD_FAILED');
    }

    await handleFiles([file]);
  } catch (error) {
    console.error('Failed to preload imported document:', error);
    showNotification(t('docImportFailed'), 'error');
  } finally {
    try {
      await sendMessage({ type: 'CLEAR_DOCUMENT_IMPORT', data: { importId } });
    } catch {}
    clearImportIdFromLocation();
  }
}

async function waitForDocumentImportMeta(importId, maxAttempts = 20, delayMs = 250) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await sendMessage({
      type: 'GET_DOCUMENT_IMPORT_META',
      data: { importId },
    });

    if (response?.success && response.meta) {
      const meta = response.meta;
      const received = Number(meta.receivedChunks || 0);
      const total = Math.max(1, Number(meta.totalChunks || 1));
      if (meta.status === 'ready' || received >= total) {
        return meta;
      }
    } else if (response?.error?.code === 'NOT_FOUND') {
      return null;
    }

    await sleep(delayMs);
  }

  return null;
}

async function buildFileFromImportedChunks(importId, meta) {
  const totalChunks = Math.max(1, Number(meta?.totalChunks || 1));
  const blobParts = [];

  for (let index = 0; index < totalChunks; index++) {
    const chunkResponse = await sendMessage({
      type: 'GET_DOCUMENT_IMPORT_CHUNK',
      data: { importId, index },
    });

    if (!chunkResponse?.success || !chunkResponse.base64Chunk) {
      throw new Error(`IMPORT_CHUNK_MISSING_${index}`);
    }

    blobParts.push(base64ChunkToUint8Array(chunkResponse.base64Chunk));
  }

  const mimeType = String(meta?.mimeType || '').trim() || 'application/octet-stream';
  const blob = new Blob(blobParts, { type: mimeType });
  const fileName = String(meta?.fileName || 'document').trim() || 'document';
  return new File([blob], fileName, {
    type: mimeType,
    lastModified: Date.now(),
  });
}

function base64ChunkToUint8Array(base64Chunk) {
  const binary = atob(String(base64Chunk || ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getNotificationHost() {
  let host = document.getElementById('toast-container');
  if (host) return host;

  host = document.createElement('div');
  host.id = 'toast-container';
  host.className = 'toast-container';
  document.body.appendChild(host);
  return host;
}

function showNotification(message, type = 'info', durationMs = 3500) {
  if (!message) return;

  const host = getNotificationHost();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  host.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  const removeToast = () => {
    toast.classList.remove('show');
    setTimeout(() => {
      toast.remove();
    }, 180);
  };

  const timerId = setTimeout(removeToast, durationMs);
  toast.addEventListener('click', () => {
    clearTimeout(timerId);
    removeToast();
  });

}

function getFileIcon(fileName) {
  const ext = fileName.split('.').pop().toLowerCase();
  switch (ext) {
    case 'xlsx':
    case 'xls':
      return '\u{1F4CA}'; // 📊
    case 'docx':
      return '\u{1F4C4}'; // 📄
    case 'pdf':
      return '\u{1F4D5}'; // 📕
    default:
      return '\u{1F4C4}';
  }
}

function getFileExtension(fileName) {
  return fileName.split('.').pop().toLowerCase();
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const LARGE_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const LARGE_SEGMENTS_WARNING_THRESHOLD = 1000;
const SEGMENT_PROGRESS_THRESHOLD = 200;
const SUPPORTED_EXTENSIONS = ['xlsx', 'xls', 'docx', 'pdf'];
const STATUS_PHASES = new Set(['parsing', 'translating', 'rebuilding', 'done', 'error', 'partial', 'waiting']);

function showView(viewName) {
  const views = document.querySelectorAll('#main-content .view');
  views.forEach((view) => view.classList.remove('active'));

  const target = document.getElementById(`view-${viewName}`);
  if (target) {
    target.classList.add('active');
    target.classList.remove('view-enter');
    void target.offsetWidth;
    target.classList.add('view-enter');
    currentView = viewName;
  }
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', init);

async function init() {
  // Load saved UI language
  const { uiLanguage } = await chrome.storage.local.get('uiLanguage');
  if (uiLanguage) {
    currentLang = uiLanguage;
  }
  applyLanguage(currentLang);

  // Language switcher
  document.querySelectorAll('.lang-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const lang = btn.dataset.lang;
      applyLanguage(lang);
      chrome.storage.local.set({ uiLanguage: lang });
      sendMessage({ type: 'UI_LANGUAGE_CHANGED', lang });
    });
  });

  // Check auth
  try {
    const status = await sendMessage({ type: 'GET_AUTH_STATUS' });
    document.getElementById('loading').style.display = 'none';

    if (status && status.authenticated) {
      await showMainContent();
    } else {
      showAuthRequired();
    }
  } catch (err) {
    document.getElementById('loading').style.display = 'none';
    showAuthRequired();
  }
}

function showAuthRequired() {
  document.getElementById('auth-required').style.display = '';
  document.getElementById('main-content').style.display = 'none';
}

async function showMainContent() {
  document.getElementById('auth-required').style.display = 'none';
  document.getElementById('main-content').style.display = '';
  const sourceLangSelect = document.getElementById('source-lang');
  const targetLangSelect = document.getElementById('target-lang');

  sourceLangSelect.disabled = true;
  targetLangSelect.disabled = true;
  sourceLangSelect.classList.add('is-loading');
  targetLangSelect.classList.add('is-loading');

  // Load languages list
  try {
    languages = await sendMessage({ type: 'GET_LANGUAGES' });
  } catch (e) {
    languages = [];
  } finally {
    sourceLangSelect.classList.remove('is-loading');
    targetLangSelect.classList.remove('is-loading');
    sourceLangSelect.disabled = false;
    targetLangSelect.disabled = false;
  }

  populateLanguageSelectors();
  setupDropZone();
  setupSwapButton();
  setupTranslateButton();
  setupLimitModal();
  setupResultsView();
  setupGlobalHandlers();
  await preloadImportedDocumentFromQuery();
  showView('upload');
}

// ===== Language Selectors =====
function populateLanguageSelectors() {
  const sourceLang = document.getElementById('source-lang');
  const targetLang = document.getElementById('target-lang');

  if (!languages || !languages.length) return;

  // Source: keep "Auto Detect" option, add languages
  for (const lang of languages) {
    const opt = document.createElement('option');
    opt.value = lang.code;
    opt.textContent = lang.name;
    sourceLang.appendChild(opt);
  }

  // Target: populate with all languages, default to RU
  for (const lang of languages) {
    const opt = document.createElement('option');
    opt.value = lang.code;
    opt.textContent = lang.name;
    targetLang.appendChild(opt);
  }

  // Set default target to RU if available
  const hasRU = languages.some((l) => l.code === 'RU');
  if (hasRU) {
    targetLang.value = 'RU';
  }
}

function setupSwapButton() {
  document.getElementById('swap-langs-btn').addEventListener('click', () => {
    const sourceLang = document.getElementById('source-lang');
    const targetLang = document.getElementById('target-lang');

    if (sourceLang.value === 'auto') {
      // Show tooltip
      const btn = document.getElementById('swap-langs-btn');
      btn.title = t('docSwapAutoTip');
      btn.classList.add('shake');
      setTimeout(() => btn.classList.remove('shake'), 500);
      return;
    }

    const temp = sourceLang.value;
    sourceLang.value = targetLang.value;
    targetLang.value = temp;
  });
}

// ===== Drop Zone =====
function setupDropZone() {
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const selectBtn = document.getElementById('select-files-btn');

  // Click on drop zone opens file dialog
  dropZone.addEventListener('click', (e) => {
    if (e.target === selectBtn || selectBtn.contains(e.target)) return;
    fileInput.click();
  });

  selectBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  // Drag & drop events
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('dragover');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
  });

  // File input change
  fileInput.addEventListener('change', () => {
    handleFiles(fileInput.files);
    fileInput.value = ''; // Reset so same file can be re-selected
  });
}

// ===== File Handling =====
async function handleFiles(fileList) {
  if (isTranslating) return;
  if (!fileList || !fileList.length) return;

  for (const file of fileList) {
    const ext = getFileExtension(file.name);
    const isLargeFile = file.size > LARGE_FILE_SIZE;
    const entry = {
      id: ++fileIdCounter,
      file,
      status: 'loading', // loading, ready, error, warning
      error: null,
      notice: isLargeFile ? t('docLargeFileProcessing') : '',
      parseResult: null,
      selectedSheets: null,
      jobId: null,
      translation: null,
      translatedResult: null,
      isLargeFile,
    };

    // Validate extension
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      entry.status = 'error';
      entry.error = t('docUnsupportedFormat');
      uploadedFiles.push(entry);
      showNotification(entry.error, 'error');
      renderFileList();
      updateTranslateButton();
      continue;
    }

    // Validate size
    if (file.size > MAX_FILE_SIZE) {
      entry.status = 'error';
      entry.error = t('docFileTooLarge');
      uploadedFiles.push(entry);
      showNotification(entry.error, 'error');
      renderFileList();
      updateTranslateButton();
      continue;
    }

    uploadedFiles.push(entry);
    showNotification(t('docFileAdded'), 'info');
    renderFileList();

    // Parse file asynchronously
    try {
      const result = await parseFile(file);
      const segments = Array.isArray(result?.segments) ? result.segments : [];
      entry.notice = '';

      if (result.error === 'NO_TEXT_LAYER') {
        entry.status = 'warning';
        entry.error = t('docNoTextLayer');
        showNotification(entry.error, 'warning');
      } else if (result.error) {
        entry.status = 'error';
        entry.error = result.message || result.error;
        showNotification(entry.error, 'error');
      } else {
        entry.parseResult = result;
        const isEmptyFile = file.size === 0;
        if (segments.length === 0) {
          entry.status = 'warning';
          entry.error = isEmptyFile ? t('docEmptyFile') : t('docNoTextContent');
          showNotification(entry.error, 'warning');
        } else {
          entry.status = 'ready';
          entry.notice = '';

          // For Excel: setup selected sheets (all by default)
          if (ext === 'xlsx' || ext === 'xls') {
            entry.selectedSheets = result.metadata.sheets.map((s) => s.name);
          }

          // For PDF: setup selected pages (all by default)
          if (ext === 'pdf' && result.metadata.pageCount > 0) {
            entry.selectedPages = Array.from(
              { length: result.metadata.pageCount },
              (_, i) => i + 1
            );
          }

          if (segments.length >= LARGE_SEGMENTS_WARNING_THRESHOLD) {
            entry.notice = t('docLargeFileWarning');
            showNotification(entry.notice, 'warning');
          } else if (entry.isLargeFile) {
            entry.notice = t('docLargeFileWarning');
          }
        }
      }
    } catch (err) {
      entry.status = 'error';
      entry.error = err.message || 'Parse error';
      entry.notice = '';
      showNotification(entry.error, 'error');
    }

    renderFileList();
    updateTranslateButton();
  }
}

function removeFile(fileId) {
  if (isTranslating) return;
  uploadedFiles = uploadedFiles.filter((f) => f.id !== fileId);
  translatedJobs = translatedJobs.filter((job) => job.fileId !== fileId);
  if (currentPreviewFileId === fileId) {
    currentPreviewFileId = null;
    currentPreviewSheet = '';
    showView('results');
  }
  renderFileList();
  renderResultsView();
  updateTranslateButton();
}

function toggleSheet(fileId, sheetName) {
  if (isTranslating) return;
  const entry = uploadedFiles.find((f) => f.id === fileId);
  if (!entry || !entry.selectedSheets) return;

  const idx = entry.selectedSheets.indexOf(sheetName);
  if (idx >= 0) {
    entry.selectedSheets.splice(idx, 1);
  } else {
    entry.selectedSheets.push(sheetName);
  }
  renderFileList();
  updateTranslateButton();
}

function toggleAllSheets(fileId, selectAll) {
  if (isTranslating) return;
  const entry = uploadedFiles.find((f) => f.id === fileId);
  if (!entry || !entry.parseResult) return;

  if (selectAll) {
    entry.selectedSheets = entry.parseResult.metadata.sheets.map((s) => s.name);
  } else {
    entry.selectedSheets = [];
  }
  renderFileList();
  updateTranslateButton();
}

function togglePage(fileId, pageNum) {
  if (isTranslating) return;
  const entry = uploadedFiles.find((f) => f.id === fileId);
  if (!entry || !entry.selectedPages) return;

  const idx = entry.selectedPages.indexOf(pageNum);
  if (idx >= 0) {
    entry.selectedPages.splice(idx, 1);
  } else {
    entry.selectedPages.push(pageNum);
    entry.selectedPages.sort((a, b) => a - b);
  }

  // Update thumbnail UI without full re-render (preserve thumbnails)
  const thumb = document.querySelector(`.page-thumb[data-file-id="${fileId}"][data-page="${pageNum}"]`);
  if (thumb) {
    thumb.classList.toggle('selected', idx < 0);
  }
  updatePagesHeader(fileId);
  updateTranslateButton();
}

function toggleAllPages(fileId, selectAll) {
  if (isTranslating) return;
  const entry = uploadedFiles.find((f) => f.id === fileId);
  if (!entry || !entry.parseResult) return;

  if (selectAll) {
    entry.selectedPages = Array.from(
      { length: entry.parseResult.metadata.pageCount },
      (_, i) => i + 1
    );
  } else {
    entry.selectedPages = [];
  }

  // Update thumbnail UI without full re-render
  const thumbs = document.querySelectorAll(`.page-thumb[data-file-id="${fileId}"]`);
  thumbs.forEach((thumb) => {
    const pageNum = Number(thumb.dataset.page);
    thumb.classList.toggle('selected', selectAll || entry.selectedPages.includes(pageNum));
  });
  updatePagesHeader(fileId);
  updateTranslateButton();
}

function updatePagesHeader(fileId) {
  const entry = uploadedFiles.find((f) => f.id === fileId);
  if (!entry) return;
  const pageCount = entry.parseResult?.metadata?.pageCount || 0;
  const selectedCount = entry.selectedPages?.length || 0;
  const allSelected = selectedCount === pageCount;
  const headerBtn = document.querySelector(`.pages-toggle-btn[data-file-id="${fileId}"]`);
  if (headerBtn) {
    headerBtn.textContent = allSelected ? t('docDeselectAll') : t('docSelectAll');
  }
  // Update the label with page count
  const label = headerBtn?.parentElement?.querySelector('.pages-label');
  if (label) {
    label.textContent = t('docPages') + ' (' + selectedCount + '/' + pageCount + '):';
  }
}

async function renderPageThumbnails(entry, container) {
  const arrayBuffer = entry.parseResult?.metadata?.originalArrayBuffer;
  if (!arrayBuffer || typeof pdfjsLib === 'undefined') return;

  let pdf;
  try {
    pdf = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;
  } catch (e) {
    console.warn('Failed to load PDF for thumbnails:', e.message);
    return;
  }

  const totalPages = pdf.numPages;
  const BATCH_SIZE = 10;

  async function renderBatch(startPage) {
    const end = Math.min(startPage + BATCH_SIZE, totalPages + 1);
    for (let i = startPage; i < end; i++) {
      // Check if container is still in DOM (file might have been removed)
      if (!container.isConnected) {
        pdf.destroy();
        return;
      }

      try {
        const page = await pdf.getPage(i);
        const origViewport = page.getViewport({ scale: 1 });
        const scale = 110 / origViewport.height;
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

        const thumb = document.createElement('div');
        thumb.className = 'page-thumb' + (entry.selectedPages?.includes(i) ? ' selected' : '');
        thumb.dataset.fileId = entry.id;
        thumb.dataset.page = i;

        thumb.appendChild(canvas);

        const pageLabel = document.createElement('div');
        pageLabel.className = 'page-num';
        pageLabel.textContent = i;
        thumb.appendChild(pageLabel);

        thumb.addEventListener('click', () => togglePage(entry.id, i));

        container.appendChild(thumb);
      } catch (e) {
        console.warn(`Failed to render thumbnail for page ${i}:`, e.message);
      }
    }

    if (end <= totalPages) {
      setTimeout(() => renderBatch(end), 0);
    } else {
      pdf.destroy();
    }
  }

  renderBatch(1);
}

// ===== Render File List =====
function renderFileList() {
  const container = document.getElementById('file-list');
  container.innerHTML = '';

  for (const entry of uploadedFiles) {
    const card = document.createElement('div');
    card.className = 'file-card';
    if (entry.status === 'error') card.className += ' error';
    if (entry.status === 'warning') card.className += ' warning';
    if (entry.status === 'loading') card.className += ' loading';

    // Header row
    const header = document.createElement('div');
    header.className = 'file-card-header';

    const icon = document.createElement('span');
    icon.className = 'file-card-icon';
    icon.textContent = getFileIcon(entry.file.name);

    const name = document.createElement('span');
    name.className = 'file-card-name';
    name.textContent = entry.file.name;

    const size = document.createElement('span');
    size.className = 'file-card-size';
    size.textContent = formatFileSize(entry.file.size);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'file-card-remove';
    removeBtn.title = t('docRemoveFile');
    removeBtn.textContent = '\u2715'; // ✕
    removeBtn.disabled = isTranslating;
    removeBtn.addEventListener('click', () => removeFile(entry.id));

    header.appendChild(icon);
    header.appendChild(name);
    header.appendChild(size);
    header.appendChild(removeBtn);
    card.appendChild(header);

    // Loading indicator
    if (entry.status === 'loading') {
      const loadingDiv = document.createElement('div');
      loadingDiv.className = 'file-card-warning file-card-loading';
      loadingDiv.textContent = entry.isLargeFile ? t('docLargeFileProcessing') : t('docParsing');
      card.appendChild(loadingDiv);
    }

    // Error message
    if (entry.status === 'error' && entry.error) {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'file-card-error';
      errorDiv.textContent = '\u274C ' + entry.error;
      card.appendChild(errorDiv);
    }

    // Warning message (PDF no text layer)
    if (entry.status === 'warning' && entry.error) {
      const warnDiv = document.createElement('div');
      warnDiv.className = 'file-card-warning';
      warnDiv.textContent = '\u26A0\uFE0F ' + entry.error;
      card.appendChild(warnDiv);
    }

    if (entry.notice) {
      const noticeDiv = document.createElement('div');
      noticeDiv.className = 'file-card-warning';
      noticeDiv.textContent = '\u2139\uFE0F ' + entry.notice;
      card.appendChild(noticeDiv);
    }

    if (entry.translation) {
      const fileTranslation = document.createElement('div');
      fileTranslation.className = 'file-translation ' + getTranslationCssClass(entry.translation);

      const headerRow = document.createElement('div');
      headerRow.className = 'file-translation-header';

      const statusText = document.createElement('span');
      statusText.className = 'file-translation-status';
      statusText.textContent = getTranslationStatusText(entry.translation);

      const percentText = document.createElement('span');
      percentText.className = 'file-translation-percent';
      const percentValue = Math.max(0, Math.min(100, Math.round(entry.translation.percent || 0)));
      percentText.textContent = percentValue + '%';

      headerRow.appendChild(statusText);
      headerRow.appendChild(percentText);
      fileTranslation.appendChild(headerRow);

      const track = document.createElement('div');
      track.className = 'progress-track';

      const fill = document.createElement('div');
      fill.className = 'progress-fill';
      fill.style.width = percentValue + '%';

      track.appendChild(fill);
      fileTranslation.appendChild(track);

      if (entry.translation.message) {
        const message = document.createElement('div');
        message.className = 'file-translation-message';
        message.textContent = entry.translation.message;
        fileTranslation.appendChild(message);
      }

      card.appendChild(fileTranslation);
    }

    // Excel sheets
    const ext = getFileExtension(entry.file.name);
    if ((ext === 'xlsx' || ext === 'xls') && entry.parseResult && entry.parseResult.metadata.sheets) {
      const sheetsSection = document.createElement('div');
      sheetsSection.className = 'sheets-section';

      const sheetsHeader = document.createElement('div');
      sheetsHeader.className = 'sheets-header';

      const sheetsLabel = document.createElement('span');
      sheetsLabel.className = 'sheets-label';
      sheetsLabel.textContent = t('docSheets') + ':';

      const allSelected = entry.selectedSheets &&
        entry.selectedSheets.length === entry.parseResult.metadata.sheets.length;
      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'sheets-toggle-btn';
      toggleBtn.textContent = allSelected ? t('docDeselectAll') : t('docSelectAll');
      toggleBtn.disabled = isTranslating;
      toggleBtn.addEventListener('click', () => toggleAllSheets(entry.id, !allSelected));

      sheetsHeader.appendChild(sheetsLabel);
      sheetsHeader.appendChild(toggleBtn);
      sheetsSection.appendChild(sheetsHeader);

      const sheetsList = document.createElement('div');
      sheetsList.className = 'sheets-list';

      for (const sheet of entry.parseResult.metadata.sheets) {
        const label = document.createElement('label');
        label.className = 'sheet-checkbox';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = entry.selectedSheets ? entry.selectedSheets.includes(sheet.name) : false;
        checkbox.disabled = isTranslating;
        checkbox.addEventListener('change', () => toggleSheet(entry.id, sheet.name));

        const span = document.createElement('span');
        span.textContent = sheet.name;

        label.appendChild(checkbox);
        label.appendChild(span);
        sheetsList.appendChild(label);
      }

      sheetsSection.appendChild(sheetsList);
      card.appendChild(sheetsSection);
    }

    // PDF options section
    if (ext === 'pdf' && entry.parseResult && entry.parseResult.metadata.pageCount > 0) {
      const pagesSection = document.createElement('div');
      pagesSection.className = 'pages-section';

      const pageCount = entry.parseResult.metadata.pageCount;

      // Page selection (only for multi-page PDFs)
      if (pageCount > 1) {
        const pagesHeader = document.createElement('div');
        pagesHeader.className = 'pages-header';

        const pagesLabel = document.createElement('span');
        pagesLabel.className = 'pages-label';
        pagesLabel.textContent = t('docPages') + ' (' + (entry.selectedPages?.length || 0) + '/' + pageCount + '):';

        const allPagesSelected = entry.selectedPages && entry.selectedPages.length === pageCount;
        const pagesToggleBtn = document.createElement('button');
        pagesToggleBtn.className = 'pages-toggle-btn';
        pagesToggleBtn.dataset.fileId = entry.id;
        pagesToggleBtn.textContent = allPagesSelected ? t('docDeselectAll') : t('docSelectAll');
        pagesToggleBtn.disabled = isTranslating;
        pagesToggleBtn.addEventListener('click', () => toggleAllPages(entry.id, !allPagesSelected));

        pagesHeader.appendChild(pagesLabel);
        pagesHeader.appendChild(pagesToggleBtn);
        pagesSection.appendChild(pagesHeader);

        const pagesList = document.createElement('div');
        pagesList.className = 'pages-list';
        pagesSection.appendChild(pagesList);

        // Render thumbnails asynchronously (don't block UI)
        renderPageThumbnails(entry, pagesList);
      }

      // Line-by-line translation checkbox
      const lineByLineLabel = document.createElement('label');
      lineByLineLabel.className = 'pdf-option-checkbox';
      const lineByLineCheckbox = document.createElement('input');
      lineByLineCheckbox.type = 'checkbox';
      lineByLineCheckbox.checked = !!entry.lineByLine;
      lineByLineCheckbox.disabled = isTranslating;
      lineByLineCheckbox.addEventListener('change', () => {
        entry.lineByLine = lineByLineCheckbox.checked;
        updateTranslateButton();
      });
      const lineByLineText = document.createElement('span');
      lineByLineText.textContent = t('docLineByLine');
      lineByLineLabel.appendChild(lineByLineCheckbox);
      lineByLineLabel.appendChild(lineByLineText);
      pagesSection.appendChild(lineByLineLabel);

      card.appendChild(pagesSection);
    }

    container.appendChild(card);
  }

  // Show/hide translate section
  const translateSection = document.getElementById('translate-section');
  translateSection.style.display = uploadedFiles.length > 0 ? '' : 'none';
}

function getTranslationCssClass(translation) {
  const status = translation.status;
  if (status === 'completed') return 'done';
  if (status === 'partial') return 'partial';
  if (status === 'error' || status === 'cancelled') return 'error';
  return '';
}

function getTranslationStatusText(translation) {
  const status = translation.status;
  const percent = Math.max(0, Math.min(100, Math.round(translation.percent || 0)));

  if (status === 'completed') return t('docDone');
  if (status === 'partial') return t('docPartial');
  if (status === 'cancelled') return t('docCancel');
  if (status === 'error') return t('docError');
  if (status === 'waiting') return t('docWaiting');
  if (status === 'parsing') return t('docParsing');
  if (status === 'rebuilding') return t('docRebuilding');
  if (status === 'translating') {
    return t('docTranslatingProgress').replace('{percent}', percent);
  }

  const phase = translation.phase;
  if (phase === 'parsing') return t('docParsing');
  if (phase === 'rebuilding') return t('docRebuilding');
  if (phase === 'translating') return t('docTranslatingProgress').replace('{percent}', percent);
  return t('docWaiting');
}

// ===== Translate Button =====
function getTranslatableFiles() {
  return uploadedFiles.filter((entry) => {
    if (entry.status !== 'ready' || !entry.parseResult) return false;
    const ext = getFileExtension(entry.file.name);
    if ((ext === 'xlsx' || ext === 'xls') && Array.isArray(entry.selectedSheets)) {
      return entry.selectedSheets.length > 0;
    }
    if (ext === 'pdf' && Array.isArray(entry.selectedPages)) {
      return entry.selectedPages.length > 0;
    }
    return true;
  });
}

function getTotalChars() {
  let total = 0;
  for (const entry of getTranslatableFiles()) {
    if (!entry.parseResult) continue;
    const ext = getFileExtension(entry.file.name);

    if ((ext === 'xlsx' || ext === 'xls') && entry.selectedSheets) {
      // Count only selected sheets
      for (const seg of entry.parseResult.segments) {
        if (entry.selectedSheets.includes(seg.meta.sheet)) {
          total += seg.text.length;
        }
      }
    } else if (ext === 'pdf' && entry.selectedPages &&
               entry.selectedPages.length < (entry.parseResult.metadata.pageCount || 0)) {
      // Count only selected pages
      const allowedPages = new Set(entry.selectedPages);
      for (const seg of entry.parseResult.segments) {
        if (allowedPages.has(seg.meta?.page)) {
          total += seg.text.length;
        }
      }
    } else {
      total += entry.parseResult.metadata.totalChars;
    }
  }
  return total;
}

function updateTranslateButton() {
  const btn = document.getElementById('translate-btn');
  const translatableFiles = getTranslatableFiles();
  const count = translatableFiles.length;
  const chars = getTotalChars();

  if (count === 0 || isTranslating) {
    btn.disabled = true;
  } else {
    btn.disabled = false;
  }

  if (isTranslating) {
    btn.querySelector('span').textContent = t('docTranslating');
  } else {
    if (count === 0) {
      btn.querySelector('span').textContent = t('docTranslateBtnNoFiles');
    } else {
      btn.querySelector('span').textContent = t('docTranslateBtn')
        .replace('{count}', count)
        .replace('{chars}', formatNumber(chars));
    }
  }

  const cancelBtn = document.getElementById('cancel-translation-btn');
  const progressBlock = document.getElementById('translation-progress');
  cancelBtn.style.display = isTranslating ? '' : 'none';
  progressBlock.style.display = isTranslating ? '' : 'none';
}

function setupTranslateButton() {
  document.getElementById('translate-btn').addEventListener('click', onTranslateClick);
  document.getElementById('cancel-translation-btn').addEventListener('click', cancelTranslation);
}

async function onTranslateClick() {
  if (isTranslating) return;

  const translatableFiles = getTranslatableFiles();
  if (translatableFiles.length === 0) return;

  const totalChars = getTotalChars();

  // Check usage limits
  try {
    const usage = await sendMessage({ type: 'GET_USAGE' });
    if (usage && usage.monthly && !usage.monthly.isUnlimited) {
      const remaining = (usage.monthly.limit || 0) - (usage.monthly.used || 0);
      if (totalChars > remaining) {
        showLimitWarning(remaining, totalChars);
        return;
      }
    }
  } catch (e) {
    // If we can't get usage, proceed anyway
  }

  await startTranslation();
}

async function startTranslation() {
  if (isTranslating) return;

  const translatableFiles = getTranslatableFiles();
  if (!translatableFiles.length) return;

  isTranslating = true;
  showView('upload');
  currentPreviewFileId = null;
  currentPreviewSheet = '';
  translatedJobs = [];
  translationManager = new TranslationManager(sendMessage);

  for (const entry of uploadedFiles) {
    entry.jobId = null;
    entry.translation = null;
    entry.translatedResult = null;
  }

  for (const entry of translatableFiles) {
    const jobOptions = {};
    const ext = getFileExtension(entry.file.name);
    if ((ext === 'xlsx' || ext === 'xls') && Array.isArray(entry.selectedSheets)) {
      jobOptions.selectedSheets = entry.selectedSheets.slice();
    }
    if (ext === 'pdf' && Array.isArray(entry.selectedPages)) {
      jobOptions.selectedPages = entry.selectedPages.slice();
    }
    if (ext === 'pdf' && entry.lineByLine) {
      jobOptions.lineByLine = true;
    }

    const jobId = translationManager.addJob(entry.file, jobOptions);
    entry.jobId = jobId;
    entry.translation = {
      status: 'waiting',
      phase: 'waiting',
      percent: 0,
      message: '',
    };
  }

  translationManager.onProgress = onJobProgress;
  translationManager.onJobComplete = onJobComplete;
  translationManager.onJobError = onJobError;
  translationManager.onRetry = onJobRetry;
  translationManager.onAllComplete = () => {
    isTranslating = false;
    translationManager = null;
    updateTranslateButton();
    updateOverallProgressUI();
    renderFileList();
    renderResultsView();
    if (hasResultEntries()) {
      showView('results');
    }
  };

  renderFileList();
  updateTranslateButton();
  updateOverallProgressUI();

  const sourceLang = document.getElementById('source-lang').value || 'auto';
  const targetLang = document.getElementById('target-lang').value;

  try {
    await translationManager.startAll(sourceLang, targetLang);
  } catch (error) {
    console.error('Translation manager error:', error);
    isTranslating = false;
    translationManager = null;
    updateTranslateButton();
    updateOverallProgressUI();
    renderFileList();
  }
}

function cancelTranslation() {
  if (!isTranslating || !translationManager) return;
  translationManager.cancel();
}

function onJobProgress(jobId, progress) {
  const entry = uploadedFiles.find((file) => file.jobId === jobId);
  if (!entry) return;

  const status = translationManager?.getJobStatus(jobId)?.status || entry.translation?.status || 'waiting';
  const phase = STATUS_PHASES.has(progress?.phase) ? progress.phase : (entry.translation?.phase || 'waiting');

  let progressMessage = '';
  if (status === 'translating' || phase === 'translating') {
    const totalSegments = getEntrySegmentCount(entry);
    if (totalSegments >= SEGMENT_PROGRESS_THRESHOLD) {
      const safePercent = Math.max(10, Math.min(90, Number(progress?.percent || 0)));
      const translated = Math.max(
        1,
        Math.min(totalSegments, Math.round(((safePercent - 10) / 80) * totalSegments))
      );
      progressMessage = tf('docSegmentProgress', {
        current: formatNumber(translated),
        total: formatNumber(totalSegments),
      });
    }
  }

  entry.translation = {
    ...(entry.translation || {}),
    status: status === 'queued' ? 'waiting' : status,
    phase,
    percent: Number.isFinite(progress?.percent) ? progress.percent : (entry.translation?.percent || 0),
    message: progressMessage,
  };

  renderFileList();
  updateOverallProgressUI();
}

function onJobRetry(jobId, retryMeta) {
  if (!retryMeta || retryMeta.code !== 'NETWORK_ERROR') return;

  const now = Date.now();
  if (now - lastConnectionToastAt < 1500) return;
  lastConnectionToastAt = now;
  showNotification(t('docConnectionLost'), 'warning');
}

function onJobComplete(jobId, result) {
  const entry = uploadedFiles.find((file) => file.jobId === jobId);
  if (!entry) return;

  const statusData = translationManager?.getJobStatus(jobId);
  const status = statusData?.status || 'completed';
  const isPartial = status === 'partial';

  entry.translatedResult = result;
  entry.translation = {
    ...(entry.translation || {}),
    status,
    phase: isPartial ? 'partial' : 'done',
    percent: 100,
    message: isPartial ? getPartialStatusMessage(entry, statusData?.error) : '',
  };

  upsertTranslatedJob(entry, status);
  renderFileList();
  renderResultsView();
  renderPreviewView();
  updateOverallProgressUI();
}

function onJobError(jobId, error) {
  const entry = uploadedFiles.find((file) => file.jobId === jobId);
  if (!entry) return;

  const statusData = translationManager?.getJobStatus(jobId);
  const status = statusData?.status || 'error';
  const isPartial = status === 'partial';

  if (statusData?.result) {
    entry.translatedResult = statusData.result;
    upsertTranslatedJob(entry, status);
  }

  entry.translation = {
    ...(entry.translation || {}),
    status,
    phase: isPartial ? 'partial' : 'error',
    percent: isPartial ? 100 : (status === 'cancelled' ? (entry.translation?.percent || 0) : 100),
    message: getTranslationErrorMessage(entry, error),
  };

  if (error?.code === 'NETWORK_ERROR') {
    showNotification(t('docConnectionLost'), 'warning');
  }

  renderFileList();
  renderResultsView();
  renderPreviewView();
  updateOverallProgressUI();
}

function upsertTranslatedJob(entry, status) {
  const existingIndex = translatedJobs.findIndex((job) => job.fileId === entry.id);
  const payload = {
    fileId: entry.id,
    jobId: entry.jobId,
    status,
    fileName: entry.file.name,
    result: entry.translatedResult,
  };

  if (existingIndex >= 0) {
    translatedJobs[existingIndex] = payload;
  } else {
    translatedJobs.push(payload);
  }
}

function getTranslationErrorMessage(entry, error) {
  if (!error) return t('docError');

  if (error.code === 'PROVIDER_NOT_CONFIGURED') {
    return `${t('docProviderNotConfigured')} ${t('docContactAdmin')}`;
  }

  if (error.code === 'LIMIT_EXCEEDED') {
    return getLimitExceededMessage(entry, error);
  }

  if (error.code === 'CANCELLED') {
    return t('docCancel');
  }

  if (error.code === 'NETWORK_ERROR') {
    return t('docConnectionLost');
  }

  return error.message || t('docError');
}

function getLimitExceededMessage(entry, error) {
  const partial = entry.translatedResult?.partial || {};
  const translated = partial.translated || error?.data?.translatedSoFar?.length || 0;
  const total = partial.total || getEntrySegmentCount(entry);

  return t('docLimitExceeded')
    .replace('{translated}', formatNumber(translated))
    .replace('{total}', formatNumber(total));
}

function getPartialStatusMessage(entry, error) {
  if (error?.code === 'LIMIT_EXCEEDED') {
    return getLimitExceededMessage(entry, error);
  }
  if (error?.code === 'NETWORK_ERROR') {
    return t('docConnectionLost');
  }
  return t('docPartial');
}

function getEntrySegmentCount(entry) {
  if (!entry.parseResult?.segments) return 0;
  const ext = getFileExtension(entry.file.name);

  if ((ext === 'xlsx' || ext === 'xls') && Array.isArray(entry.selectedSheets)) {
    const selectedSet = new Set(entry.selectedSheets);
    return entry.parseResult.segments.filter((segment) => selectedSet.has(segment?.meta?.sheet)).length;
  }

  return entry.parseResult.segments.length;
}

function updateOverallProgressUI() {
  const textNode = document.getElementById('overall-progress-text');
  const percentNode = document.getElementById('overall-progress-percent');
  const fillNode = document.getElementById('overall-progress-fill');

  if (!textNode || !percentNode || !fillNode) return;

  const jobs = uploadedFiles.filter((entry) => entry.jobId !== null);
  const total = jobs.length;

  if (total === 0) {
    textNode.textContent = t('docOverallProgress').replace('{current}', 0).replace('{total}', 0);
    percentNode.textContent = '0%';
    fillNode.style.width = '0%';
    return;
  }

  let finished = 0;
  let active = 0;
  let percentSum = 0;

  for (const entry of jobs) {
    const status = entry.translation?.status || 'waiting';
    let percent = entry.translation?.percent || 0;

    if (status === 'completed' || status === 'partial' || status === 'error' || status === 'cancelled') {
      finished += 1;
      percent = 100;
    } else if (status !== 'waiting') {
      active += 1;
    }

    percentSum += Math.max(0, Math.min(100, percent));
  }

  const current = Math.min(total, finished + (active > 0 ? 1 : 0));
  const overallPercent = Math.round(percentSum / total);

  textNode.textContent = t('docOverallProgress')
    .replace('{current}', current)
    .replace('{total}', total);
  percentNode.textContent = `${overallPercent}%`;
  fillNode.style.width = `${overallPercent}%`;
}

// ===== Limit Warning Modal =====
function setupLimitModal() {
  document.getElementById('limit-cancel').addEventListener('click', hideLimitWarning);
  document.getElementById('limit-continue').addEventListener('click', async () => {
    hideLimitWarning();
    await startTranslation();
  });
}

function showLimitWarning(remaining, required) {
  const details = document.getElementById('limit-details');
  details.textContent = t('docLimitRemaining')
    .replace('{remaining}', formatNumber(remaining))
    .replace('{required}', formatNumber(required));
  document.getElementById('limit-modal').style.display = '';
}

function hideLimitWarning() {
  document.getElementById('limit-modal').style.display = 'none';
}

function setupGlobalHandlers() {
  if (globalHandlersBound) return;
  globalHandlersBound = true;

  window.addEventListener('beforeunload', (event) => {
    if (!isTranslating) return;
    event.preventDefault();
    event.returnValue = t('docCloseWarning');
    return t('docCloseWarning');
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && currentView === 'preview') {
      event.preventDefault();
      currentPreviewSheet = '';
      showView('results');
    }
  });
}

// ===== Views: Results + Preview =====
function setupResultsView() {
  const grid = document.getElementById('results-grid');
  const downloadAllBtn = document.getElementById('download-all-btn');
  const newTranslationBtn = document.getElementById('new-translation-btn');
  const previewBackBtn = document.getElementById('preview-back-btn');
  const previewDownloadBtn = document.getElementById('preview-download-btn');
  const previewContent = document.getElementById('preview-content');

  if (grid) {
    grid.addEventListener('click', (event) => {
      const downloadBtn = event.target.closest('.card-download');
      if (downloadBtn) {
        event.stopPropagation();
        const fileId = Number(downloadBtn.dataset.fileId);
        if (Number.isFinite(fileId)) {
          downloadResultByFileId(fileId, downloadBtn);
        }
        return;
      }

      const card = event.target.closest('.result-card');
      if (!card) return;

      const fileId = Number(card.dataset.fileId);
      if (!Number.isFinite(fileId)) return;

      openPreview(fileId);
    });

    grid.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (event.target.closest('.card-download')) return;

      const card = event.target.closest('.result-card');
      if (!card) return;

      const fileId = Number(card.dataset.fileId);
      if (!Number.isFinite(fileId)) return;

      event.preventDefault();
      openPreview(fileId);
    });
  }

  if (downloadAllBtn) {
    downloadAllBtn.addEventListener('click', () => {
      downloadAllResults(downloadAllBtn);
    });
  }

  if (newTranslationBtn) {
    newTranslationBtn.addEventListener('click', startNewTranslation);
  }

  if (previewBackBtn) {
    previewBackBtn.addEventListener('click', () => {
      showView('results');
    });
  }

  if (previewDownloadBtn) {
    previewDownloadBtn.addEventListener('click', () => {
      if (currentPreviewFileId === null) return;
      downloadResultByFileId(currentPreviewFileId, previewDownloadBtn);
    });
  }

  if (previewContent) {
    previewContent.addEventListener('click', (event) => {
      const tab = event.target.closest('.preview-tab');
      if (!tab) return;

      const sheetName = tab.dataset.sheet;
      if (!sheetName) return;

      currentPreviewSheet = sheetName;
      renderPreviewView();
    });
  }
}

function hasResultEntries() {
  return getResultEntries().length > 0;
}

function getResultEntries() {
  return uploadedFiles.filter((entry) => {
    if (entry.translation) {
      return ['completed', 'partial', 'error', 'cancelled'].includes(entry.translation.status);
    }
    return entry.status === 'error' || entry.status === 'warning';
  });
}

function getDownloadableResultEntries() {
  return getResultEntries().filter(canDownloadEntry);
}

function renderResultsView() {
  const summary = document.getElementById('results-summary');
  const grid = document.getElementById('results-grid');
  const downloadAllBtn = document.getElementById('download-all-btn');
  if (!summary || !grid) return;

  const entries = getResultEntries();
  const totalChars = entries.reduce((sum, entry) => {
    return sum + Number(entry.translatedResult?.totalChars || 0);
  }, 0);

  summary.textContent = tf('docResults', {
    count: formatNumber(entries.length),
    chars: formatNumber(totalChars),
  });

  const downloadableCount = getDownloadableResultEntries().length;
  if (downloadAllBtn) {
    downloadAllBtn.disabled = isArchiveDownloadInProgress || downloadableCount === 0;
  }

  grid.innerHTML = '';

  if (!entries.length) {
    const empty = document.createElement('div');
    empty.className = 'results-empty';
    empty.textContent = t('docNoFilesTranslated');
    grid.appendChild(empty);
    return;
  }

  for (const entry of entries) {
    grid.appendChild(createResultCard(entry));
  }
}

function createResultCard(entry) {
  const status = getResultCardStatus(entry);
  const statusClass = `status-${status}`;
  const canDownload = canDownloadEntry(entry);
  const fileName = getResultFileName(entry);
  const originalName = entry.file?.name || entry.parseResult?.metadata?.fileName || fileName;

  const card = document.createElement('div');
  card.className = 'result-card';
  card.dataset.fileId = String(entry.id);
  card.dataset.jobId = entry.jobId ? String(entry.jobId) : '';
  card.dataset.status = status;
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', tf('docPreviewTitle', { fileName }));

  const icon = document.createElement('div');
  icon.className = 'card-icon';
  icon.textContent = getFileIcon(fileName);
  card.appendChild(icon);

  const title = document.createElement('div');
  title.className = 'card-title';
  title.textContent = fileName;
  card.appendChild(title);

  const original = document.createElement('div');
  original.className = 'card-original-name';
  original.textContent = tf('docOriginalName', { name: originalName });
  card.appendChild(original);

  const preview = document.createElement('div');
  preview.className = 'card-preview';
  preview.innerHTML = buildMiniPreview(entry);
  card.appendChild(preview);

  const statusRow = document.createElement('div');
  statusRow.className = `card-status ${statusClass}`;

  const statusIcon = document.createElement('span');
  statusIcon.className = 'status-icon';
  statusIcon.textContent = getResultStatusIcon(status);

  const statusText = document.createElement('span');
  statusText.className = 'status-text';
  statusText.textContent = getResultStatusText(entry, status);

  statusRow.appendChild(statusIcon);
  statusRow.appendChild(statusText);
  card.appendChild(statusRow);

  const statusMessage = getResultStatusMessage(entry);
  if (statusMessage) {
    const message = document.createElement('div');
    message.className = 'card-status-message';
    message.textContent = statusMessage;
    card.appendChild(message);
  }

  const actions = document.createElement('div');
  actions.className = 'card-actions';

  const downloadBtn = document.createElement('button');
  downloadBtn.className = 'btn btn-small btn-primary card-download';
  downloadBtn.dataset.fileId = String(entry.id);
  downloadBtn.disabled = !canDownload;
  downloadBtn.textContent = `\u2B07 ${t('docDownload')}`;

  actions.appendChild(downloadBtn);
  card.appendChild(actions);

  return card;
}

function getResultCardStatus(entry) {
  const translationStatus = entry.translation?.status;
  if (translationStatus === 'completed') return 'completed';
  if (translationStatus === 'partial') return 'partial';
  if (translationStatus === 'error' || translationStatus === 'cancelled') return 'error';

  if (entry.status === 'error' || entry.status === 'warning') return 'error';
  return 'completed';
}

function getResultStatusIcon(status) {
  if (status === 'completed') return '\u2713';
  if (status === 'partial') return '\u26A0';
  return '\u2717';
}

function getResultStatusText(entry, status) {
  if (status === 'completed') return t('docStatusDone');
  if (status === 'partial') return t('docStatusPartial');

  if (entry.translation?.status === 'cancelled') {
    return t('docStatusCancelled');
  }
  return t('docStatusError');
}

function getResultStatusMessage(entry) {
  if (entry.translation?.status === 'partial') {
    const partial = entry.translatedResult?.partial;
    if (partial && Number.isFinite(partial.translated) && Number.isFinite(partial.total)) {
      return tf('docPartialTranslated', {
        translated: formatNumber(partial.translated),
        total: formatNumber(partial.total),
      });
    }
  }

  return entry.translation?.message || entry.error || '';
}

function getResultFileName(entry) {
  return entry.translatedResult?.fileName || entry.file?.name || 'document';
}

function getEntryType(entry) {
  const type = entry.translatedResult?.metadata?.type || entry.parseResult?.metadata?.type || getFileExtension(getResultFileName(entry));
  return type === 'xls' ? 'xlsx' : type;
}

function getEntrySegments(entry) {
  if (Array.isArray(entry.translatedResult?.segments)) {
    return entry.translatedResult.segments.slice().sort((a, b) => a.index - b.index);
  }
  if (Array.isArray(entry.parseResult?.segments)) {
    return entry.parseResult.segments.slice().sort((a, b) => a.index - b.index);
  }
  return [];
}

function canDownloadEntry(entry) {
  const status = entry.translation?.status;
  if (!entry.translatedResult?.blob) return false;
  return status === 'completed' || status === 'partial';
}

function buildMiniPreview(entry) {
  const status = getResultCardStatus(entry);
  if (status === 'error' && !entry.translatedResult) {
    return `<div class="preview-text"><p>${escapeHtml(entry.translation?.message || entry.error || t('docPreviewError'))}</p></div>`;
  }

  const type = getEntryType(entry);
  if (type === 'xlsx') {
    return buildMiniExcelPreview(entry);
  }

  return buildMiniTextPreview(entry, type);
}

function buildMiniTextPreview(entry, type) {
  const segments = getEntrySegments(entry);
  if (!segments.length) {
    return `<div class="preview-text"><p>${escapeHtml(t('docNoPreviewData'))}</p></div>`;
  }

  const sourceSegments = type === 'pdf'
    ? segments.filter((segment) => Number(segment?.meta?.page || 0) <= 1)
    : segments;
  const paragraphs = collectPreviewParagraphs(sourceSegments, 200);
  const items = paragraphs.map((text) => `<p>${escapeHtml(text)}</p>`).join('');
  return `<div class="preview-text">${items}</div>`;
}

function collectPreviewParagraphs(segments, maxChars) {
  const paragraphs = [];
  let charsUsed = 0;

  for (const segment of segments) {
    const text = String(segment?.translatedText || segment?.text || '').trim();
    if (!text) continue;

    const remaining = maxChars - charsUsed;
    if (remaining <= 0) break;

    if (text.length <= remaining) {
      paragraphs.push(text);
      charsUsed += text.length;
      continue;
    }

    const clipped = text.slice(0, Math.max(0, remaining)).trimEnd();
    paragraphs.push(clipped + '...');
    charsUsed = maxChars;
    break;
  }

  if (!paragraphs.length) {
    paragraphs.push(t('docNoPreviewData'));
  }

  return paragraphs;
}

function buildMiniExcelPreview(entry) {
  const workbook = entry.translatedResult?.metadata?.workbook || entry.parseResult?.metadata?.workbook;
  const sheets = entry.translatedResult?.metadata?.sheets || entry.parseResult?.metadata?.sheets || [];
  const firstSheetName = sheets[0]?.name || workbook?.SheetNames?.[0];
  if (!workbook || !firstSheetName) {
    return `<div class="preview-text"><p>${escapeHtml(t('docNoPreviewData'))}</p></div>`;
  }

  const sheet = workbook.Sheets[firstSheetName];
  if (!sheet || !sheet['!ref']) {
    return `<div class="preview-text"><p>${escapeHtml(t('docNoPreviewData'))}</p></div>`;
  }

  const range = XLSX.utils.decode_range(sheet['!ref']);
  const maxRows = Math.min(range.e.r, range.s.r + 2);
  const maxCols = Math.min(range.e.c, range.s.c + 2);
  const rows = [];

  for (let r = range.s.r; r <= maxRows; r++) {
    const cells = [];
    for (let c = range.s.c; c <= maxCols; c++) {
      const address = XLSX.utils.encode_cell({ r, c });
      const value = getExcelCellDisplayValue(sheet[address]);
      cells.push(`<td>${escapeHtml(value)}</td>`);
    }
    rows.push(`<tr>${cells.join('')}</tr>`);
  }

  if (!rows.length) {
    return `<div class="preview-text"><p>${escapeHtml(t('docNoPreviewData'))}</p></div>`;
  }

  return `<table class="preview-table">${rows.join('')}</table>`;
}

function openPreview(fileId) {
  const entry = uploadedFiles.find((item) => item.id === fileId);
  if (!entry) return;

  const type = getEntryType(entry);
  if (type === 'xlsx') {
    const sheets = entry.translatedResult?.metadata?.sheets || entry.parseResult?.metadata?.sheets || [];
    if (!currentPreviewSheet || !sheets.some((sheet) => sheet.name === currentPreviewSheet)) {
      currentPreviewSheet = sheets[0]?.name || '';
    }
  } else {
    currentPreviewSheet = '';
  }

  currentPreviewFileId = fileId;
  renderPreviewView();
  showView('preview');
}

function renderPreviewView() {
  const titleNode = document.getElementById('preview-title');
  const contentNode = document.getElementById('preview-content');
  const downloadBtn = document.getElementById('preview-download-btn');
  if (!titleNode || !contentNode || !downloadBtn) return;

  if (currentPreviewFileId === null) {
    titleNode.textContent = '';
    contentNode.innerHTML = '';
    downloadBtn.disabled = true;
    return;
  }

  const entry = uploadedFiles.find((item) => item.id === currentPreviewFileId);
  if (!entry) {
    titleNode.textContent = '';
    contentNode.innerHTML = `<div class="preview-empty">${escapeHtml(t('docNoPreviewData'))}</div>`;
    downloadBtn.disabled = true;
    return;
  }

  const fileName = getResultFileName(entry);
  titleNode.textContent = tf('docPreviewTitle', { fileName });
  downloadBtn.disabled = !canDownloadEntry(entry);

  const status = getResultCardStatus(entry);
  if (status === 'error' && !entry.translatedResult) {
    contentNode.innerHTML = `
      <div class="preview-empty">
        ${escapeHtml(entry.translation?.message || entry.error || t('docPreviewError'))}
      </div>
    `;
    return;
  }

  const type = getEntryType(entry);
  if (type === 'xlsx') {
    contentNode.innerHTML = buildExcelFullPreview(entry);
    return;
  }

  if (type === 'docx') {
    contentNode.innerHTML = buildWordFullPreview(entry);
    return;
  }

  if (type === 'pdf') {
    contentNode.innerHTML = buildPDFFullPreview(entry);
    return;
  }

  contentNode.innerHTML = `<div class="preview-empty">${escapeHtml(t('docNoPreviewData'))}</div>`;
}

function buildExcelFullPreview(entry) {
  const workbook = entry.translatedResult?.metadata?.workbook || entry.parseResult?.metadata?.workbook;
  const sheets = entry.translatedResult?.metadata?.sheets || entry.parseResult?.metadata?.sheets || [];
  const sheetNames = sheets.map((sheet) => sheet.name);
  const fallbackNames = workbook?.SheetNames || [];
  const allSheetNames = sheetNames.length ? sheetNames : fallbackNames;

  if (!workbook || !allSheetNames.length) {
    return `<div class="preview-empty">${escapeHtml(t('docNoPreviewData'))}</div>`;
  }

  if (!currentPreviewSheet || !allSheetNames.includes(currentPreviewSheet)) {
    currentPreviewSheet = allSheetNames[0];
  }

  const tabs = allSheetNames.map((sheetName) => {
    const activeClass = sheetName === currentPreviewSheet ? 'active' : '';
    return `<button class="preview-tab ${activeClass}" data-sheet="${escapeHtml(sheetName)}">${escapeHtml(sheetName)}</button>`;
  }).join('');

  const tableMarkup = buildExcelFullTable(workbook, currentPreviewSheet);

  return `
    <div class="preview-tabs">${tabs}</div>
    <div class="preview-table-container">${tableMarkup}</div>
  `;
}

function buildExcelFullTable(workbook, sheetName) {
  const sheet = workbook?.Sheets?.[sheetName];
  if (!sheet || !sheet['!ref']) {
    return `<div class="preview-empty">${escapeHtml(t('docNoPreviewData'))}</div>`;
  }

  const range = XLSX.utils.decode_range(sheet['!ref']);
  const MAX_ROWS = 500;
  const MAX_COLS = 80;
  const endRow = Math.min(range.e.r, range.s.r + MAX_ROWS - 1);
  const endCol = Math.min(range.e.c, range.s.c + MAX_COLS - 1);
  const isTruncated = endRow < range.e.r || endCol < range.e.c;

  const headerCells = ['<th class="sticky-col">#</th>'];
  for (let c = range.s.c; c <= endCol; c++) {
    headerCells.push(`<th>${escapeHtml(XLSX.utils.encode_col(c))}</th>`);
  }

  const bodyRows = [];
  for (let r = range.s.r; r <= endRow; r++) {
    const rowCells = [`<th class="sticky-col row-number">${r + 1}</th>`];
    for (let c = range.s.c; c <= endCol; c++) {
      const address = XLSX.utils.encode_cell({ r, c });
      const value = getExcelCellDisplayValue(sheet[address]);
      rowCells.push(`<td>${escapeHtml(value)}</td>`);
    }
    bodyRows.push(`<tr>${rowCells.join('')}</tr>`);
  }

  const truncatedNote = isTruncated
    ? `<div class="preview-note">${escapeHtml(tf('docPreviewTruncated', {
      rows: endRow - range.s.r + 1,
      cols: endCol - range.s.c + 1,
    }))}</div>`
    : '';

  return `
    ${truncatedNote}
    <table class="preview-full-table">
      <thead><tr>${headerCells.join('')}</tr></thead>
      <tbody>${bodyRows.join('')}</tbody>
    </table>
  `;
}

function getExcelCellDisplayValue(cell) {
  if (!cell) return '';
  if (cell.f) return `=${cell.f}`;
  if (cell.v === null || cell.v === undefined) return '';
  return String(cell.v);
}

function buildWordFullPreview(entry) {
  const segments = getEntrySegments(entry);
  if (!segments.length) {
    return `<div class="preview-empty">${escapeHtml(t('docNoPreviewData'))}</div>`;
  }

  const lines = [];
  let tableCells = [];

  const flushTable = () => {
    if (!tableCells.length) return;
    const columnCount = Math.min(3, Math.max(1, tableCells.length >= 6 ? 3 : 2));
    const rows = [];
    for (let i = 0; i < tableCells.length; i += columnCount) {
      const cells = tableCells.slice(i, i + columnCount)
        .map((text) => `<td>${escapeHtml(text)}</td>`)
        .join('');
      rows.push(`<tr>${cells}</tr>`);
    }
    lines.push(`<table class="preview-doc-table"><tbody>${rows.join('')}</tbody></table>`);
    tableCells = [];
  };

  let paragraphNumber = 0;
  for (const segment of segments) {
    const text = String(segment?.translatedText || segment?.text || '').trim();
    if (!text) continue;

    if (segment?.meta?.type === 'table-cell') {
      tableCells.push(text);
      continue;
    }

    flushTable();
    const paragraphClass = paragraphNumber === 0 ? 'preview-paragraph preview-heading' : 'preview-paragraph';
    lines.push(`<p class="${paragraphClass}">${escapeHtml(text)}</p>`);
    paragraphNumber += 1;
  }

  flushTable();

  if (!lines.length) {
    return `<div class="preview-empty">${escapeHtml(t('docNoPreviewData'))}</div>`;
  }

  return `<div class="preview-document">${lines.join('')}</div>`;
}

function buildPDFFullPreview(entry) {
  const segments = getEntrySegments(entry);
  if (!segments.length) {
    return `<div class="preview-empty">${escapeHtml(t('docNoPreviewData'))}</div>`;
  }

  const pageMap = new Map();
  for (const segment of segments) {
    const page = Number(segment?.meta?.page || 1);
    if (!pageMap.has(page)) {
      pageMap.set(page, []);
    }
    pageMap.get(page).push(segment);
  }

  // Use selectedPages if available, otherwise all pages
  const selectedPages = entry.translatedResult?.metadata?.selectedPages
    || entry.selectedPages
    || null;
  let pageNumbers;
  if (Array.isArray(selectedPages) && selectedPages.length > 0) {
    pageNumbers = selectedPages.slice().sort((a, b) => a - b);
  } else {
    const maxPageFromMetadata = Number(entry.translatedResult?.metadata?.pageCount || entry.parseResult?.metadata?.pageCount || 0);
    const maxPageFromSegments = pageMap.size ? Math.max(...Array.from(pageMap.keys())) : 0;
    const pageCount = Math.max(maxPageFromMetadata, maxPageFromSegments, 1);
    pageNumbers = Array.from({ length: pageCount }, (_, i) => i + 1);
  }

  const pages = [];
  for (const page of pageNumbers) {
    const pageSegments = (pageMap.get(page) || []).slice().sort((a, b) => {
      return Number(a?.meta?.blockIndex || 0) - Number(b?.meta?.blockIndex || 0);
    });
    const paragraphHtml = pageSegments.map((segment) => {
      const text = String(segment?.translatedText || segment?.text || '').trim();
      return text ? `<p>${escapeHtml(text)}</p>` : '';
    }).join('');

    pages.push(`
      <div class="pdf-page">
        <div class="pdf-page-header">- ${escapeHtml(tf('docPage', { n: page }))} -</div>
        <div class="pdf-page-content">${paragraphHtml || `<p>${escapeHtml(t('docNoPreviewData'))}</p>`}</div>
      </div>
    `);
  }

  return `<div class="preview-pdf-pages">${pages.join('')}</div>`;
}

function startNewTranslation() {
  if (isTranslating && translationManager) {
    translationManager.cancel();
  }

  isTranslating = false;
  translationManager = null;
  uploadedFiles = [];
  translatedJobs = [];
  currentPreviewFileId = null;
  currentPreviewSheet = '';
  isArchiveDownloadInProgress = false;

  renderFileList();
  renderResultsView();
  renderPreviewView();
  updateTranslateButton();
  updateOverallProgressUI();
  showView('upload');
}

function getDownloadManager() {
  return window.DownloadManager || null;
}

function getDownloadedStateLabel() {
  const translated = t('docDownloaded');
  if (translated.endsWith('!')) {
    return `${translated.slice(0, -1)} \u2713`;
  }
  return `${translated} \u2713`;
}

function flashButtonLabel(button, temporaryLabel, durationMs, resolveDisabledState) {
  if (!button) return;

  const originalText = button.textContent;
  button.textContent = temporaryLabel;
  button.disabled = true;

  setTimeout(() => {
    button.textContent = originalText;
    if (typeof resolveDisabledState === 'function') {
      button.disabled = Boolean(resolveDisabledState());
    } else {
      button.disabled = false;
    }
  }, durationMs);
}

function downloadResultByFileId(fileId, triggerButton) {
  const entry = uploadedFiles.find((item) => item.id === fileId);
  if (!entry || !canDownloadEntry(entry)) return;

  const downloadManager = getDownloadManager();
  if (!downloadManager) return;

  const downloaded = downloadManager.downloadResult(entry);
  if (downloaded && triggerButton) {
    flashButtonLabel(triggerButton, getDownloadedStateLabel(), 1000, () => {
      const latestEntry = uploadedFiles.find((item) => item.id === fileId);
      return !latestEntry || !canDownloadEntry(latestEntry);
    });
  }
  if (downloaded) {
    showNotification(t('docDownloaded'), 'success');
  }
}

async function downloadAllResults(triggerButton) {
  if (isArchiveDownloadInProgress) return;

  const downloadManager = getDownloadManager();
  if (!downloadManager) return;

  const entries = getResultEntries();
  const downloadableEntries = getDownloadableResultEntries();
  if (!entries.length || !downloadableEntries.length) {
    flashButtonLabel(triggerButton, t('docNoFilesToDownload'), 1200, () => {
      return getDownloadableResultEntries().length === 0;
    });
    showNotification(t('docNoFilesToDownload'), 'warning');
    return;
  }

  const button = triggerButton || document.getElementById('download-all-btn');
  const defaultLabel = t('docDownloadAll');
  isArchiveDownloadInProgress = true;

  if (button) {
    button.disabled = true;
    button.textContent = t('docCreatingArchive');
  }

  try {
    const outcome = await downloadManager.downloadAllAsZip(entries, {
      onProgress(metadata) {
        const percent = Math.round(Number(metadata?.percent || 0));
        const safePercent = Math.max(0, Math.min(100, percent));
        if (button) {
          button.textContent = tf('docArchiveProgress', { percent: safePercent });
        }
      },
    });
    if (outcome?.downloaded) {
      showNotification(t('docDownloaded'), 'success');
    }
  } catch (error) {
    console.error('Archive download failed:', error);
    showNotification(t('docError'), 'error');
  } finally {
    isArchiveDownloadInProgress = false;
    if (button) {
      button.textContent = defaultLabel;
    }
    renderResultsView();
  }
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
