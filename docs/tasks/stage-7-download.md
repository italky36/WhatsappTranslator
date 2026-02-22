# Этап 7: Скачивание файлов

## Цель
Реализовать скачивание переведённых файлов: индивидуальное скачивание каждого файла и массовое скачивание всех файлов в ZIP-архиве.

## Контекст

### Доступные данные
После завершения перевода (Этап 5) для каждого файла доступен:
```javascript
job.result = {
  blob: Blob,                         // переведённый файл
  fileName: 'report_translated.xlsx', // имя файла для скачивания
  metadata: {
    type: 'xlsx' | 'docx' | 'pdf',
    fileName: 'report.xlsx',          // оригинальное имя
  }
}
```

### MIME-типы для скачивания
| Формат | MIME-тип |
|--------|----------|
| .xlsx | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |
| .docx | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| .pdf → .txt | `text/plain;charset=utf-8` |
| .zip | `application/zip` |

### Библиотеки
**JSZip** — для создания ZIP-архива при скачивании нескольких файлов.
Файл: `extension/libs/jszip.min.js` (~90KB)

---

## Задачи

### 7.1. Скачивание одного файла

Создать утилитарный модуль: `extension/src/document/download-manager.js`

```javascript
function downloadFile(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Освободить память через небольшую задержку
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
```

**Точки вызова:**
1. Кнопка "Скачать" на карточке результата (Этап 6)
2. Кнопка "Скачать" в полноэкранном превью (Этап 6)

### 7.2. Скачивание всех файлов (ZIP)

```javascript
async function downloadAllAsZip(jobs) {
  // jobs — массив завершённых заданий с результатами

  const zip = new JSZip();
  const successfulJobs = jobs.filter(j => j.status === 'completed' || j.status === 'partial');

  if (successfulJobs.length === 0) {
    // Нет файлов для скачивания — показать уведомление
    return;
  }

  for (const job of successfulJobs) {
    zip.file(job.result.fileName, job.result.blob);
  }

  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const timestamp = new Date().toISOString().slice(0, 10); // 2025-01-15
  downloadFile(zipBlob, `translations_${timestamp}.zip`);
}
```

**Точка вызова:**
- Кнопка "Скачать все" в шапке результатов (Этап 6)

### 7.3. Подключение JSZip

Если ещё не добавлена в Этапе 3:
1. Скачать `jszip.min.js` (версия 3.x)
2. Поместить в `extension/libs/jszip.min.js`
3. Подключить в `document.html`:
```html
<script src="../../libs/jszip.min.js"></script>
```

### 7.4. Обработка скачивания PDF

PDF переводится в текстовый формат. При скачивании:

```javascript
function downloadPDFResult(job) {
  // Основной вариант — plain text
  const textBlob = new Blob(
    [job.result.textContent],
    { type: 'text/plain;charset=utf-8' }
  );

  // BOM для корректного отображения кириллицы в Блокноте Windows
  const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
  const blobWithBOM = new Blob([bom, textBlob], { type: 'text/plain;charset=utf-8' });

  downloadFile(blobWithBOM, job.result.fileName);
}
```

> **Важно**: UTF-8 BOM добавляется для корректного отображения кириллицы в Windows Notepad.

### 7.5. Привязка кнопок скачивания к UI

Обновить обработчики в `document.js`:

```javascript
// Кнопка скачивания на карточке
document.addEventListener('click', (e) => {
  const downloadBtn = e.target.closest('.card-download');
  if (downloadBtn) {
    e.stopPropagation(); // Не открывать превью при клике на кнопку
    const jobId = downloadBtn.closest('.result-card').dataset.jobId;
    const job = translationManager.getJob(jobId);
    if (job?.result) {
      downloadFile(job.result.blob, job.result.fileName);
    }
  }
});

// Кнопка "Скачать все"
document.getElementById('download-all-btn').addEventListener('click', () => {
  const jobs = translationManager.getCompletedJobs();
  downloadAllAsZip(jobs);
});

// Кнопка скачивания в полноэкранном превью
document.getElementById('preview-download-btn').addEventListener('click', () => {
  const job = currentPreviewJob;
  if (job?.result) {
    downloadFile(job.result.blob, job.result.fileName);
  }
});
```

### 7.6. Обратная связь при скачивании

- При клике на "Скачать" — кнопка на секунду меняет текст на "Скачано ✓" / "Downloaded ✓"
- При клике на "Скачать все" — показать индикатор "Создание архива..." пока JSZip генерирует ZIP
- Для больших архивов (>10MB) — показать прогресс:
  ```javascript
  zip.generateAsync({ type: 'blob' }, (metadata) => {
    const percent = metadata.percent.toFixed(0);
    updateButton(`Архивирование... ${percent}%`);
  });
  ```

---

## i18n ключи

```javascript
// EN
docDownloaded: 'Downloaded!',
docCreatingArchive: 'Creating archive...',
docArchiveProgress: 'Archiving... {percent}%',
docNoFilesToDownload: 'No files to download',

// RU
docDownloaded: 'Скачано!',
docCreatingArchive: 'Создание архива...',
docArchiveProgress: 'Архивирование... {percent}%',
docNoFilesToDownload: 'Нет файлов для скачивания',
```

---

## Файлы для создания
- `extension/src/document/download-manager.js` — модуль скачивания
- `extension/libs/jszip.min.js` — библиотека JSZip (если не добавлена ранее)

## Файлы для изменения
- `extension/src/document/document.html` — подключить download-manager.js и jszip
- `extension/src/document/document.js` — привязать обработчики кнопок скачивания

---

## Критерии приёмки

1. Клик на "Скачать" на карточке скачивает один переведённый файл
2. Клик на "Скачать" в полноэкранном превью скачивает текущий файл
3. Клик на "Скачать все" создаёт ZIP-архив со всеми переведёнными файлами
4. ZIP-архив имеет имя `translations_YYYY-MM-DD.zip`
5. Файлы Excel скачиваются в формате `.xlsx`
6. Файлы Word скачиваются в формате `.docx`
7. Файлы PDF скачиваются как `.txt` с UTF-8 BOM
8. Кнопка скачивания не открывает полноэкранный превью (stopPropagation)
9. При скачивании ZIP показывается индикатор прогресса
10. Кириллица в именах файлов и содержимом сохраняется корректно
11. Файлы с ошибками не включаются в ZIP

## Зависимости
- Этап 5 (результаты перевода — blob, fileName)
- Этап 6 (карточки с кнопками скачивания)
- JSZip библиотека
