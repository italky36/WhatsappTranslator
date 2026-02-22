# Этап 3: Парсинг файлов (фронтенд)

## Цель
Реализовать модули парсинга файлов на фронтенде (внутри расширения) для форматов .xlsx, .xls, .docx, .pdf. Каждый модуль должен уметь: извлекать текстовые сегменты из файла, а после перевода — собирать файл обратно с переведённым текстом.

## Контекст

### Архитектурное решение
Парсинг файлов выполняется **на фронтенде** (в браузере), а не на backend. Причины:
- Файлы не загружаются на сервер (конфиденциальность)
- Backend остаётся неизменным (только batch API из Этапа 2)
- JS-библиотеки для парсинга документов хорошо развиты

### Формат сегментов для перевода
Все парсеры должны возвращать единый формат, совместимый с `POST /translate/batch`:
```javascript
// Извлечение
{
  segments: [
    { text: "Hello world", index: 0, meta: { sheet: "Sheet1", cell: "A1" } },
    { text: "Good morning", index: 1, meta: { sheet: "Sheet1", cell: "B2" } },
  ],
  metadata: {
    type: 'xlsx',          // тип файла
    fileName: 'report.xlsx',
    totalSegments: 2,
    totalChars: 23,
    structure: { ... }     // специфичные данные для обратной сборки
  }
}
```

### Библиотеки
Все библиотеки подключаются **локально** (копируются в папку расширения). CDN недопустим для расширений Chrome.

---

## Задачи

### 3.1. Подготовка библиотек

Создать директорию `extension/libs/` и поместить туда:

| Библиотека | Файл | Назначение | Размер |
|-----------|------|-----------|--------|
| SheetJS | `xlsx.full.min.js` | Чтение/запись Excel (.xlsx, .xls) | ~300KB |
| Mammoth | `mammoth.browser.min.js` | Чтение .docx → HTML | ~70KB |
| PDF.js | `pdf.min.js` + `pdf.worker.min.js` | Чтение PDF | ~400KB |

Скачать через npm и скопировать dist-файлы, или скачать release-версии.

Подключить в `document.html`:
```html
<script src="../../libs/xlsx.full.min.js"></script>
<script src="../../libs/mammoth.browser.min.js"></script>
<script src="../../libs/pdf.min.js"></script>
```

### 3.2. Модуль парсинга Excel (.xlsx / .xls)

Создать файл: `extension/src/document/parsers/excel-parser.js`

**Функция извлечения:**
```javascript
async function parseExcel(file) → {
  segments: Array<{ text, index, meta }>,
  metadata: {
    type: 'xlsx' | 'xls',
    fileName: string,
    sheets: Array<{ name: string, rowCount: number, colCount: number }>,
    totalSegments: number,
    totalChars: number,
    workbook: XLSX.WorkBook  // для обратной сборки
  }
}
```

Логика:
1. Читать файл через `FileReader` как `ArrayBuffer`
2. Парсить через `XLSX.read(data, { type: 'array' })`
3. Для каждого листа книги:
   - Пройти по всем ячейкам
   - Извлечь **только текстовые** ячейки (тип `s` — string)
   - **Пропустить** числовые (тип `n`), булевые (тип `b`), ячейки с ошибками (тип `e`)
   - **Пропустить** ячейки с формулами — сохранить формулу как есть
   - Для каждой текстовой ячейки создать сегмент с `meta: { sheet, cell, row, col }`
4. Вернуть список сегментов + метаданные о структуре книги
5. Пустые ячейки и ячейки с только пробелами — пропускать

**Функция выбора листов:**
```javascript
function getSheetNames(workbook) → string[]
```
Возвращает список имён листов для UI выбора.

**Функция обратной сборки:**
```javascript
async function rebuildExcel(originalWorkbook, translatedSegments, selectedSheets) → Blob
```

Логика:
1. Клонировать оригинальный workbook
2. Для каждого переведённого сегмента:
   - Найти ячейку по `meta.sheet` + `meta.cell`
   - Заменить значение на переведённый текст
   - **Не менять** формат ячейки (стили, шрифты, цвета, границы)
3. Сгенерировать файл через `XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })`
4. Вернуть как `Blob`

**Важные моменты:**
- `XLSX.read` с опцией `{ cellStyles: true }` для сохранения стилей
- Кириллица: SheetJS корректно работает с UTF-8, спецобработка не нужна
- Обработка merged cells (объединённые ячейки) — переводить содержимое основной ячейки
- `.xls` (старый формат) — SheetJS поддерживает чтение, запись делать в `.xlsx`

### 3.3. Модуль парсинга Word (.docx)

Создать файл: `extension/src/document/parsers/word-parser.js`

**Функция извлечения:**
```javascript
async function parseWord(file) → {
  segments: Array<{ text, index, meta }>,
  metadata: {
    type: 'docx',
    fileName: string,
    totalSegments: number,
    totalChars: number,
    arrayBuffer: ArrayBuffer  // для обратной сборки
  }
}
```

Логика:
1. Читать файл как `ArrayBuffer`
2. .docx — это ZIP-архив с XML-файлами внутри
3. Использовать mammoth.js для извлечения структуры:
   ```javascript
   const result = await mammoth.extractRawText({ arrayBuffer });
   ```
4. **Лучший подход**: работать напрямую с XML через JSZip (mammoth теряет структуру):
   - Распаковать .docx как ZIP
   - Парсить `word/document.xml`
   - Найти все `<w:t>` элементы (текстовые run-ы)
   - Каждый `<w:p>` (параграф) = один сегмент для перевода
   - Сохранить позицию в XML для обратной подстановки
5. Для таблиц: каждая ячейка `<w:tc>` = отдельный сегмент
6. Meta: `{ type: 'paragraph' | 'table-cell', paragraphIndex, runIndices }`

**Функция обратной сборки:**
```javascript
async function rebuildWord(originalArrayBuffer, translatedSegments) → Blob
```

Логика:
1. Распаковать оригинальный .docx через JSZip
2. Парсить `word/document.xml` как DOM
3. Для каждого переведённого сегмента:
   - Найти соответствующий `<w:p>` или `<w:tc>`
   - Заменить текст в `<w:t>` элементах
   - **Сохранить** форматирование (`<w:rPr>` — run properties)
   - **Сохранить** стили параграфов (`<w:pPr>`)
4. Сериализовать изменённый XML обратно
5. Упаковать обратно в ZIP
6. Вернуть как `Blob` (mime: `application/vnd.openxmlformats-officedocument.wordprocessingml.document`)

**Важные моменты:**
- JSZip потребуется для работы с ZIP — добавить в `extension/libs/`
- Кириллические шрифты: сохранять оригинальные `<w:rFonts>` из run properties
- Headers/footers (`word/header1.xml`, `word/footer1.xml`) — переводить тоже
- Картинки и другие медиа — не трогать, они в `word/media/`

### 3.4. Модуль парсинга PDF

Создать файл: `extension/src/document/parsers/pdf-parser.js`

**Функция извлечения:**
```javascript
async function parsePDF(file) → {
  segments: Array<{ text, index, meta }>,
  metadata: {
    type: 'pdf',
    fileName: string,
    pageCount: number,
    hasTextLayer: boolean,
    totalSegments: number,
    totalChars: number,
  }
} | { error: 'NO_TEXT_LAYER' }
```

Логика:
1. Читать файл как `ArrayBuffer`
2. Загрузить через PDF.js: `pdfjsLib.getDocument({ data: arrayBuffer })`
3. Для каждой страницы:
   - `page.getTextContent()` → получить текстовые элементы
   - Если на ВСЕХ страницах текста нет → вернуть `{ error: 'NO_TEXT_LAYER' }`
   - Объединять текстовые элементы в параграфы (по `hasEOL` или расстоянию между элементами)
   - Каждый логический блок текста = сегмент
4. Meta: `{ page: number, blockIndex: number }`

**Определение текстового слоя:**
```javascript
async function hasTextLayer(pdfDocument) → boolean
```
- Проверить первые 3 страницы
- Если общее количество символов < 10 → считать, что текстового слоя нет
- Вернуть `false` — показать уведомление пользователю

**Обратная сборка:**
PDF — закрытый формат, пересборка с сохранением layout очень сложна. Реализовать два варианта:

1. **Текстовый вариант** (основной):
   ```javascript
   function buildTranslatedText(translatedSegments, metadata) → string
   ```
   - Возвращает plain text с разделением по страницам
   - Формат: `--- Page 1 ---\nТекст\n\n--- Page 2 ---\nТекст`

2. **HTML-вариант** (для превью):
   ```javascript
   function buildTranslatedHTML(translatedSegments, metadata) → string
   ```
   - Структурированный HTML с заголовками страниц
   - Используется для полноэкранного превью

> **OCR не реализуется.** Если в PDF нет текстового слоя — уведомление пользователю.

### 3.5. Общий интерфейс парсеров

Создать файл: `extension/src/document/parsers/index.js`

```javascript
async function parseFile(file) {
  const extension = file.name.split('.').pop().toLowerCase();

  switch (extension) {
    case 'xlsx':
    case 'xls':
      return parseExcel(file);
    case 'docx':
      return parseWord(file);
    case 'pdf':
      return parsePDF(file);
    default:
      return { error: 'UNSUPPORTED_FORMAT', message: `Format .${extension} is not supported` };
  }
}

async function rebuildFile(originalFile, translatedSegments, options) {
  const extension = originalFile.name.split('.').pop().toLowerCase();

  switch (extension) {
    case 'xlsx':
    case 'xls':
      return rebuildExcel(options.workbook, translatedSegments, options.selectedSheets);
    case 'docx':
      return rebuildWord(options.arrayBuffer, translatedSegments);
    case 'pdf':
      return {
        textBlob: new Blob([buildTranslatedText(translatedSegments, options.metadata)], { type: 'text/plain' }),
        htmlContent: buildTranslatedHTML(translatedSegments, options.metadata),
      };
    default:
      throw new Error('Unsupported format');
  }
}

function getSupportedExtensions() {
  return ['.xlsx', '.xls', '.docx', '.pdf'];
}

function getAcceptString() {
  return '.xlsx,.xls,.docx,.pdf';
}
```

---

## Файлы для создания
- `extension/libs/` — директория для библиотек
- `extension/libs/xlsx.full.min.js` — SheetJS
- `extension/libs/mammoth.browser.min.js` — Mammoth (если используется)
- `extension/libs/jszip.min.js` — JSZip (для .docx работы)
- `extension/libs/pdf.min.js` — PDF.js
- `extension/libs/pdf.worker.min.js` — PDF.js worker
- `extension/src/document/parsers/excel-parser.js`
- `extension/src/document/parsers/word-parser.js`
- `extension/src/document/parsers/pdf-parser.js`
- `extension/src/document/parsers/index.js`

## Файлы для изменения
- `extension/src/document/document.html` — подключить скрипты библиотек и парсеров

---

## Критерии приёмки

### Excel
1. Корректно читает .xlsx файлы с несколькими листами
2. Извлекает только текстовые ячейки, пропускает числа и формулы
3. Возвращает список листов для выбора пользователем
4. Пересобирает файл с переведённым текстом, сохраняя форматирование
5. Корректно обрабатывает кириллицу в ячейках и названиях листов
6. Объединённые ячейки обрабатываются корректно
7. Формулы остаются нетронутыми

### Word
1. Корректно читает .docx файлы
2. Извлекает текст из параграфов и таблиц
3. Пересобирает файл с сохранением:
   - Структуры документа (параграфы, таблицы)
   - Форматирования (жирный, курсив, размер шрифта)
   - Стилей
4. Корректно обрабатывает кириллицу и кириллические шрифты
5. Картинки и медиа остаются нетронутыми

### PDF
1. Корректно определяет наличие текстового слоя
2. Если текст есть — извлекает его постранично
3. Если текста нет — возвращает ошибку `NO_TEXT_LAYER`
4. Генерирует текстовый и HTML вариант перевода
5. Кириллица в PDF обрабатывается корректно

### Общее
1. Все парсеры возвращают единый формат `{ segments, metadata }`
2. Пустые сегменты (пробелы, пустые строки) фильтруются
3. Функция `parseFile` корректно определяет формат по расширению
4. Неподдерживаемые форматы отклоняются с понятным сообщением

## Зависимости
- Этап 1 (страница document.html для подключения скриптов)
- npm пакеты: xlsx, mammoth, jszip, pdfjs-dist (для копирования dist-файлов)
