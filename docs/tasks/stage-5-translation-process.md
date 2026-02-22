# Этап 5: Процесс перевода

## Цель
Реализовать полный цикл перевода файлов: извлечение текстовых сегментов из загруженных файлов, отправка батчами на backend API, отслеживание прогресса, обработка ошибок и сборка переведённых файлов.

## Контекст

### Входные данные (из Этапа 4)
При нажатии кнопки "Перевести" доступны:
- `files[]` — массив загруженных File объектов
- `sourceLang` — исходный язык (`'auto'` или код)
- `targetLang` — целевой язык (код, напр. `'RU'`)
- Для Excel: `selectedSheets` — выбранные листы (массив имён)

### Парсеры (из Этапа 3)
```javascript
parseFile(file) → { segments: [{ text, index, meta }], metadata }
rebuildFile(originalFile, translatedSegments, options) → Blob
```

### Backend API (из Этапа 2)
```javascript
// Через background.js
sendMessage({
  type: 'TRANSLATE_BATCH',
  data: {
    segments: [{ text, index }],  // макс 500 за раз
    source: 'auto',
    target: 'RU'
  }
})
→ { success, results: [{ translatedText, index }], totalCharCount, detectedSourceLang }
```

Ограничения:
- Максимум 500 сегментов в одном batch-запросе
- DeepL: ~50 текстов за один API-вызов (backend разбивает сам)
- Лимиты символов пользователя (429 при превышении)

---

## Задачи

### 5.1. Менеджер перевода (Translation Manager)

Создать файл: `extension/src/document/translation-manager.js`

Центральный модуль, управляющий процессом перевода.

```javascript
class TranslationManager {
  constructor(sendMessageFn) {
    this.sendMessage = sendMessageFn;
    this.jobs = [];              // массив заданий (по одному на файл)
    this.onProgress = null;      // callback(jobId, progress)
    this.onJobComplete = null;   // callback(jobId, result)
    this.onJobError = null;      // callback(jobId, error)
    this.onAllComplete = null;   // callback(results)
  }

  // Добавить файл в очередь
  addJob(file, options) → jobId

  // Запустить перевод всех файлов
  async startAll(sourceLang, targetLang) → void

  // Отменить всё
  cancel() → void

  // Получить статус задания
  getJobStatus(jobId) → { status, progress, result, error }
}
```

### 5.2. Обработка одного файла (Job)

Каждый файл обрабатывается как отдельное задание:

```javascript
async function processJob(job, sourceLang, targetLang) {
  // 1. Парсинг файла
  job.status = 'parsing';
  job.progress = { phase: 'parsing', percent: 0 };
  onProgress(job.id, job.progress);

  const parseResult = await parseFile(job.file);

  if (parseResult.error) {
    throw new TranslationError(parseResult.error, parseResult.message);
  }

  const { segments, metadata } = parseResult;

  // 2. Фильтрация (для Excel — только выбранные листы)
  let filteredSegments = segments;
  if (metadata.type === 'xlsx' || metadata.type === 'xls') {
    filteredSegments = segments.filter(s =>
      job.options.selectedSheets.includes(s.meta.sheet)
    );
  }

  // 3. Перевод батчами
  job.status = 'translating';
  const translatedSegments = await translateSegments(
    filteredSegments, sourceLang, targetLang, (percent) => {
      job.progress = { phase: 'translating', percent };
      onProgress(job.id, job.progress);
    }
  );

  // 4. Сборка файла
  job.status = 'rebuilding';
  job.progress = { phase: 'rebuilding', percent: 90 };
  onProgress(job.id, job.progress);

  const resultBlob = await rebuildFile(job.file, translatedSegments, {
    workbook: metadata.workbook,
    arrayBuffer: metadata.arrayBuffer,
    selectedSheets: job.options.selectedSheets,
    metadata: metadata,
  });

  // 5. Готово
  job.status = 'completed';
  job.progress = { phase: 'done', percent: 100 };
  job.result = {
    blob: resultBlob,
    fileName: generateOutputFileName(job.file.name),
    segments: translatedSegments,  // для превью
    metadata: metadata,
    totalChars: translatedSegments.reduce((sum, s) => sum + s.text.length, 0),
  };

  return job.result;
}
```

### 5.3. Пакетная отправка сегментов

```javascript
async function translateSegments(segments, sourceLang, targetLang, onProgress) {
  const BATCH_SIZE = 50;  // количество сегментов в одном batch-запросе
  const batches = [];

  // Разбить на батчи
  for (let i = 0; i < segments.length; i += BATCH_SIZE) {
    batches.push(segments.slice(i, i + BATCH_SIZE));
  }

  const allResults = [];
  let completedSegments = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];

    const response = await sendMessage({
      type: 'TRANSLATE_BATCH',
      data: {
        segments: batch.map(s => ({ text: s.text, index: s.index })),
        source: sourceLang,
        target: targetLang,
      }
    });

    if (!response.success) {
      // Обработка ошибок
      if (response.error?.code === 'LIMIT_EXCEEDED') {
        throw new TranslationError('LIMIT_EXCEEDED', response.error.message, {
          details: response.error.details,
          translatedSoFar: allResults,
        });
      }
      throw new TranslationError('TRANSLATION_FAILED', response.error?.message || 'Unknown error');
    }

    // Мерж результатов с метаданными из оригинальных сегментов
    for (const result of response.results) {
      const original = batch.find(s => s.index === result.index);
      allResults.push({
        ...result,
        meta: original?.meta,
      });
    }

    completedSegments += batch.length;
    onProgress(Math.round((completedSegments / segments.length) * 80)); // 80% = перевод
  }

  return allResults;
}
```

### 5.4. Генерация имени выходного файла

```javascript
function generateOutputFileName(originalName) {
  const lastDot = originalName.lastIndexOf('.');
  const name = originalName.substring(0, lastDot);
  const ext = originalName.substring(lastDot);

  // Excel: всегда .xlsx (даже если оригинал .xls)
  const outputExt = ext === '.xls' ? '.xlsx' : ext;

  // PDF → .txt (основной вариант)
  const pdfExt = '.txt';

  if (ext === '.pdf') {
    return `${name}_translated${pdfExt}`;
  }

  return `${name}_translated${outputExt}`;
}
```

### 5.5. Обработка ошибок

Класс ошибок:
```javascript
class TranslationError extends Error {
  constructor(code, message, data = {}) {
    super(message);
    this.code = code;
    this.data = data;
  }
}
```

Типы ошибок и действия:

| Код | Причина | Действие UI |
|-----|---------|-------------|
| `UNSUPPORTED_FORMAT` | Неподдерживаемый формат | Показать ошибку на карточке файла |
| `NO_TEXT_LAYER` | PDF без текстового слоя | Показать предупреждение, пропустить файл |
| `LIMIT_EXCEEDED` | Превышен лимит символов | Показать сколько переведено, предложить скачать частичный результат |
| `TRANSLATION_FAILED` | Ошибка DeepL | Retry 1 раз, при повторной ошибке — показать ошибку |
| `PROVIDER_NOT_CONFIGURED` | DeepL не настроен | Показать ошибку "Свяжитесь с администратором" |
| `NETWORK_ERROR` | Нет связи с сервером | Retry 2 раза с backoff (1с, 3с), потом ошибка |

При частичном переводе (LIMIT_EXCEEDED в середине):
- Сохранить уже переведённые сегменты
- Собрать файл с частичным переводом (переведённое + оригинал для остального)
- Показать статус "Частично переведён" с количеством переведённых/всего

### 5.6. UI прогресса

Обновить `document.html` и `document.js` для отображения прогресса:

**Общий прогресс-бар:**
```
┌──────────────────────────────────────────────┐
│  Перевод: 2 из 3 файлов                      │
│  ████████████░░░░░░░░ 65%                    │
└──────────────────────────────────────────────┘
```

**Прогресс для каждого файла:**
```
┌──────────────────────────────────────────────┐
│ 📊 report.xlsx     Перевод... 45%            │
│ ███████████░░░░░░░░░░░░░░░                   │
├──────────────────────────────────────────────┤
│ 📄 contract.docx   Ожидание...               │
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░                  │
├──────────────────────────────────────────────┤
│ 📕 manual.pdf      ✓ Готово                  │
│ ████████████████████████████                  │
└──────────────────────────────────────────────┘
```

**Фазы прогресса:**
- `parsing` (0-10%) — "Анализ файла..." / "Parsing file..."
- `translating` (10-90%) — "Перевод... X%" / "Translating... X%"
- `rebuilding` (90-95%) — "Сборка файла..." / "Rebuilding file..."
- `done` (100%) — "Готово ✓" / "Done ✓"
- `error` — "Ошибка ✗" / "Error ✗" (красный)
- `partial` — "Частично ⚠" / "Partial ⚠" (оранжевый)

### 5.7. Параллельность vs последовательность

Файлы переводить **последовательно** (один за другим), не параллельно. Причины:
- Лимиты символов — при параллельном переводе сложнее контролировать
- Backend rate limiting — один пользователь = одна очередь
- Прогресс проще отслеживать

Внутри одного файла — батчи тоже последовательно (DeepL rate limits).

---

## i18n ключи

```javascript
// EN
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

// RU
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
```

---

## Файлы для создания
- `extension/src/document/translation-manager.js` — менеджер перевода

## Файлы для изменения
- `extension/src/document/document.html` — добавить разметку прогресса
- `extension/src/document/document.js` — подключить TranslationManager, обработчик кнопки "Перевести"
- `extension/src/document/document.css` — стили прогресс-баров, статусов

---

## Критерии приёмки

1. При нажатии "Перевести" запускается последовательная обработка файлов
2. Для каждого файла выполняется: парсинг → перевод батчами → сборка
3. Прогресс-бар обновляется в реальном времени (общий + индивидуальный)
4. Сегменты отправляются батчами по 50 штук
5. При ошибке `LIMIT_EXCEEDED` — показывается частичный результат
6. При сетевой ошибке — retry до 2 раз с backoff
7. Кнопка "Отмена" прерывает перевод
8. Переведённые файлы сохраняются в памяти для превью и скачивания
9. Имя выходного файла: `originalname_translated.ext`
10. Кириллица обрабатывается без ошибок во всех форматах

## Зависимости
- Этап 2 (backend batch endpoint)
- Этап 3 (парсеры файлов)
- Этап 4 (UI загрузки, список файлов, языки)
