# Этап 1: Инфраструктура страницы перевода документов

## Цель
Создать базовую инфраструктуру для модуля перевода документов: страницу `document.html`, которая открывается из popup расширения в новой вкладке, использует существующую авторизацию и может взаимодействовать с backend API через background script.

## Контекст проекта

### Текущая структура расширения
```
extension/
├── manifest.json              # Manifest V3
├── src/
│   ├── background/
│   │   └── background.js      # Service Worker — центральный хаб сообщений
│   ├── content/
│   │   ├── content.js         # Инъекция в WhatsApp Web
│   │   └── content.css
│   └── popup/
│       ├── popup.html         # Popup UI (320px)
│       └── popup.js           # Логика popup + i18n (EN/RU)
└── assets/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

### Как работает авторизация сейчас
1. Пользователь вводит email/password в popup
2. `popup.js` отправляет `chrome.runtime.sendMessage({ type: 'LOGIN', data: { email, password } })`
3. `background.js` делает `POST /auth/login` → получает `accessToken` + `refreshToken`
4. Токены сохраняются в `chrome.storage.local`
5. Все API-вызовы проходят через `background.js` функцию `apiCall(path, options)`, которая автоматически:
   - Добавляет `Authorization: Bearer <token>` header
   - При 401 обновляет токен через `POST /auth/refresh`
   - Повторяет запрос с новым токеном

### Типы сообщений background.js
- `LOGIN` → авторизация
- `LOGOUT` → выход
- `GET_AUTH_STATUS` → проверка авторизации (вызывает `GET /auth/me`)
- `TRANSLATE` → перевод текста (вызывает `POST /translate`)
- `GET_SETTINGS` → получение настроек из `chrome.storage.local`
- `SAVE_SETTINGS` → сохранение настроек
- `GET_USAGE` → статистика использования (вызывает `GET /usage`)
- `GET_LANGUAGES` → список языков (вызывает `GET /languages`)
- `UI_LANGUAGE_CHANGED` → смена языка UI

### Backend API (Fastify + TypeScript)
- Сервер: `http://192.168.5.70:3000` (настраивается в `background.js` переменная `API_URL`)
- Авторизация: JWT Bearer token
- Перевод: `POST /translate` — принимает `{ text, source, target, context }`
- Языки: `GET /languages` — возвращает `{ languages: [{ code, name }] }`
- Usage: `GET /usage` — возвращает лимиты и использование

---

## Задачи

### 1.1. Создать файлы страницы документов

Создать директорию `extension/src/document/` с файлами:

**`extension/src/document/document.html`**
- HTML-страница, которая будет открываться в отдельной вкладке браузера
- Использовать ту же дизайн-систему, что в `popup.html` (цвета, шрифты, стили кнопок)
- Цветовая схема: `#25D366` (основной зелёный), `#128C7E` (тёмный зелёный), фоны `#f8f8f8`
- Шрифт: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
- Страница должна содержать:
  - Шапку с заголовком "Document Translation" / "Перевод документов" и переключатель языка UI (EN/RU)
  - Область для контента (пока заглушка)
  - Индикатор загрузки при инициализации
  - Экран "Требуется авторизация" — если пользователь не авторизован
- **Не подключать внешние CDN** — все ресурсы локальные (требование расширений Chrome)
- Кодировка UTF-8

**`extension/src/document/document.js`**
- При загрузке страницы:
  1. Проверить авторизацию через `chrome.runtime.sendMessage({ type: 'GET_AUTH_STATUS' })`
  2. Если авторизован — показать основной интерфейс, загрузить список языков
  3. Если не авторизован — показать сообщение "Пожалуйста, авторизуйтесь через popup расширения" с инструкцией
- Реализовать функцию `sendMessage(message)` — обёртку над `chrome.runtime.sendMessage` (как в `popup.js`)
- Реализовать систему i18n аналогично `popup.js`:
  - Объект `i18n` с ключами `en` и `ru`
  - Функция `t(key)` для перевода
  - Функция `applyLanguage(lang)` — обновляет все элементы с `data-i18n`
  - Загрузка сохранённого языка из `chrome.storage.local` ключ `uiLanguage`
- Экспортировать/сделать доступной функцию `sendMessage` для будущих модулей

**`extension/src/document/document.css`**
- Базовые стили страницы (полноэкранная, не 320px как popup)
- Адаптивная вёрстка (min-width: 800px, max-width: 1400px, центрирование)
- Переиспользовать стилевые переменные из popup: цвета кнопок, форм, toggle-ов
- Стили для состояний: загрузка, ошибка авторизации, основной контент

### 1.2. Обновить manifest.json

Текущий `manifest.json`:
```json
{
  "manifest_version": 3,
  "name": "WhatsApp Translator",
  "version": "1.0.0",
  "permissions": ["storage", "activeTab"],
  "host_permissions": ["https://web.whatsapp.com/*"],
  "action": {
    "default_popup": "src/popup/popup.html"
  },
  "background": {
    "service_worker": "src/background/background.js",
    "type": "module"
  },
  "content_scripts": [{
    "matches": ["https://web.whatsapp.com/*"],
    "js": ["src/content/content.js"],
    "css": ["src/content/content.css"],
    "run_at": "document_idle"
  }]
}
```

Необходимые изменения:
1. Добавить `"tabs"` в `permissions` (нужно для `chrome.tabs.create`)
2. Добавить секцию `web_accessible_resources` — чтобы страница `document.html` могла использовать `chrome.runtime.sendMessage`:
```json
"web_accessible_resources": [{
  "resources": ["src/document/*"],
  "matches": ["<all_urls>"]
}]
```

> **Важно**: страница расширения, открытая через `chrome-extension://ID/src/document/document.html`, автоматически имеет доступ к Chrome Extension API. `web_accessible_resources` нужен только если страница загружается из внешнего контекста. Для `chrome.tabs.create({ url: chrome.runtime.getURL('...') })` достаточно `tabs` permission.

### 1.3. Добавить кнопку в popup

В файл `extension/src/popup/popup.html`:
- Добавить кнопку "Перевод документа" / "Document Translation" в секцию `#main-screen` (после секции Options, перед кнопкой Save)
- Использовать класс `btn btn-secondary` для визуального отличия от основной кнопки Save
- Добавить иконку документа (SVG inline или Unicode символ) — опционально
- Кнопка должна быть видна только авторизованным пользователям (она уже внутри `#main-screen`)

В файл `extension/src/popup/popup.js`:
- Добавить обработчик клика на кнопку:
```javascript
document.getElementById('doc-translate-btn').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('src/document/document.html') });
});
```
- Добавить i18n ключи:
  - `en.docTranslate: 'Document Translation'`
  - `ru.docTranslate: 'Перевод документов'`

### 1.4. Добавить новый тип сообщения в background.js

В файл `extension/src/background/background.js`:
- Добавить обработчик `TRANSLATE_BATCH` в `handleMessage()`:
```javascript
case 'TRANSLATE_BATCH':
  return handleTranslateBatch(message.data);
```
- Реализовать функцию `handleTranslateBatch`:
```javascript
async function handleTranslateBatch({ segments, source, target }) {
  // segments: [{ text, index }]
  // Отправляет на POST /translate/batch (будет создан в Этапе 2)
  // Возвращает: { success, results: [{ translatedText, index }] }
}
```
- **Пока** реализовать как заглушку, которая вызывает `/translate` для каждого сегмента последовательно (batch endpoint будет в Этапе 2)

---

## Файлы для создания
- `extension/src/document/document.html` — новый
- `extension/src/document/document.js` — новый
- `extension/src/document/document.css` — новый

## Файлы для изменения
- `extension/manifest.json` — добавить `tabs` permission
- `extension/src/popup/popup.html` — добавить кнопку
- `extension/src/popup/popup.js` — добавить обработчик кнопки + i18n ключи
- `extension/src/background/background.js` — добавить обработчик `TRANSLATE_BATCH`

---

## Критерии приёмки

1. При клике на кнопку "Перевод документов" в popup открывается новая вкладка со страницей `document.html`
2. Страница корректно определяет авторизацию пользователя через background script
3. Если пользователь авторизован — отображается основной интерфейс (пока пустой контент-блок)
4. Если не авторизован — отображается сообщение с инструкцией
5. Переключатель языка UI (EN/RU) работает и синхронизирован с popup
6. Список языков загружается с backend через `GET_LANGUAGES`
7. Расширение не ломается после изменений в `manifest.json`
8. Все текстовые элементы имеют i18n поддержку (RU/EN)
9. Страница корректно отображает кириллицу (UTF-8)

## Зависимости
- Нет внешних зависимостей
- Этот этап является фундаментом для всех остальных этапов
