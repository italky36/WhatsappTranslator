# Этап 2: Backend — batch-перевод

## Цель
Добавить endpoint `POST /translate/batch` на backend для пакетного перевода массива текстовых сегментов. Это необходимо для эффективного перевода документов, где текст разбит на множество сегментов (ячейки Excel, параграфы Word, блоки PDF).

## Контекст проекта

### Текущий endpoint перевода
Файл: `backend/src/routes/translate.ts`

```typescript
// POST /translate
// Body: { text: string, source: string, target: string, context?: { direction } }
// Response: { translatedText, detectedSourceLang, charCount, cached }
```

Логика:
1. Валидация через Zod
2. Проверка конфигурации DeepL
3. Получение лимитов пользователя из Prisma (SQLite)
4. Проверка месячного и дневного лимита через Redis
5. Проверка кеша Redis (`getCachedTranslation`)
6. Вызов DeepL API (`translateText` из `services/deepl.ts`)
7. Инкремент usage в Redis
8. Запись в `UsageMonthly` через Prisma
9. Кеширование результата в Redis

### DeepL API
Файл: `backend/src/services/deepl.ts`

DeepL API **нативно поддерживает массивы текстов**:
```typescript
const body = {
  text: [text],        // ← Уже массив! Можно передать несколько строк
  target_lang: 'RU',
  source_lang: 'EN',   // опционально
};
```
Response:
```json
{
  "translations": [
    { "detected_source_language": "EN", "text": "Перевод 1" },
    { "detected_source_language": "EN", "text": "Перевод 2" }
  ]
}
```

### Redis утилиты
Файл: `backend/src/utils/redis.ts`

Доступные функции:
- `getMonthlyUsage(userId)` → число символов за месяц
- `getDailyUsage(userId)` → число символов за день
- `incrementUsage(userId, chars)` → инкремент месячного счётчика
- `incrementDailyUsage(userId, chars)` → инкремент дневного счётчика
- `getCachedTranslation(text, source, target)` → кешированный перевод или null
- `cacheTranslation(text, source, target, translatedText)` → сохранить в кеш

### Middleware авторизации
Файл: `backend/src/middleware/auth.ts`

`authMiddleware` — preHandler для Fastify. Проверяет JWT Bearer token, добавляет `request.user` с полями:
- `id: string`
- `email: string`
- `role: string`

---

## Задачи

### 2.1. Добавить функцию пакетного перевода в DeepL-сервис

Файл: `backend/src/services/deepl.ts`

Добавить функцию `translateBatch`:
```typescript
export async function translateBatch(
  texts: string[],
  targetLang: string,
  sourceLang?: string
): Promise<{
  translations: Array<{ translatedText: string; detectedSourceLang: string }>;
  totalCharCount: number;
}>
```

Реализация:
- DeepL API принимает массив `text: string[]` — использовать это нативно
- DeepL API имеет лимит ~50 текстов за один запрос и ~128KB суммарно
- Если `texts.length > 50` — разбить на подмассивы по 50 и отправить последовательно
- Суммировать `totalCharCount` по всем текстам
- Возвращать массив переводов в том же порядке, что и входные тексты
- Фильтровать пустые строки (не отправлять на перевод, возвращать как есть)

### 2.2. Создать endpoint POST /translate/batch

Файл: `backend/src/routes/translate.ts`

Добавить в функцию `translateRoutes` новый route:

**Запрос:**
```typescript
POST /translate/batch
Authorization: Bearer <token>

{
  "segments": [
    { "text": "Hello world", "index": 0 },
    { "text": "Good morning", "index": 1 },
    { "text": "", "index": 2 }           // пустой — пропускается
  ],
  "source": "auto",     // или код языка
  "target": "RU"        // обязательно
}
```

**Ответ (успех):**
```json
{
  "results": [
    { "translatedText": "Привет мир", "index": 0 },
    { "translatedText": "Доброе утро", "index": 1 },
    { "translatedText": "", "index": 2 }
  ],
  "totalCharCount": 23,
  "detectedSourceLang": "EN"
}
```

**Ответ (ошибка лимита):**
```json
{
  "error": {
    "code": "LIMIT_EXCEEDED",
    "message": "Monthly character limit exceeded",
    "details": { "type": "monthly", "used": 495000, "limit": 500000 }
  }
}
```

**Валидация (Zod):**
```typescript
const batchTranslateSchema = z.object({
  segments: z.array(z.object({
    text: z.string().max(10000),
    index: z.number().int().min(0),
  })).min(1).max(500),
  source: z.string().default('auto'),
  target: z.string(),
});
```

**Логика обработки:**
1. Валидация входных данных
2. Проверка конфигурации DeepL
3. Подсчёт общего количества символов (сумма длин всех `text`)
4. Проверка лимитов (общая сумма символов за один раз, не поштучно)
5. Фильтрация: пустые сегменты (text = '') — не отправлять на перевод, вернуть как есть
6. Проверка кеша для каждого сегмента индивидуально
7. Отправка НЕкешированных сегментов на DeepL через `translateBatch`
8. Кеширование каждого нового перевода
9. Инкремент usage один раз на общую сумму символов
10. Обновление `UsageMonthly` в Prisma
11. Возврат всех результатов (кеш + новые) с сохранением порядка по `index`

**Обработка ошибок:**
- `VALIDATION_ERROR` (400) — невалидный запрос
- `PROVIDER_NOT_CONFIGURED` (503) — DeepL не настроен
- `LIMIT_EXCEEDED` (429) — превышен лимит символов (проверка ДО перевода)
- `TRANSLATION_FAILED` (500) — ошибка DeepL API
- `INVALID_API_KEY` (503) — невалидный ключ
- `PROVIDER_QUOTA_EXCEEDED` (503) — лимит DeepL исчерпан

### 2.3. Обновить обработчик в background.js

Файл: `extension/src/background/background.js`

Заменить заглушку `TRANSLATE_BATCH` (из Этапа 1) на реальный вызов:

```javascript
async function handleTranslateBatch({ segments, source, target }) {
  const response = await apiCall('/translate/batch', {
    method: 'POST',
    body: JSON.stringify({ segments, source, target }),
  });

  const data = await response.json();

  if (response.ok) {
    return { success: true, ...data };
  } else {
    return { success: false, error: data.error };
  }
}
```

---

## Файлы для изменения
- `backend/src/services/deepl.ts` — добавить `translateBatch()`
- `backend/src/routes/translate.ts` — добавить `POST /translate/batch`
- `extension/src/background/background.js` — обновить `handleTranslateBatch`

## Файлы для создания
- Нет

---

## Критерии приёмки

1. `POST /translate/batch` работает с массивом сегментов (1-500)
2. Пустые сегменты не отправляются на DeepL, возвращаются как пустые строки
3. Лимит символов проверяется ДО начала перевода (сумма всех символов)
4. Кеш работает для каждого сегмента индивидуально
5. Usage инкрементируется одним вызовом на сумму всех символов
6. Порядок результатов соответствует порядку входных сегментов (по `index`)
7. При ошибке DeepL API возвращается корректный error response
8. Тексты с кириллицей переводятся корректно
9. Background script корректно проксирует вызовы к batch endpoint

## Зависимости
- Этап 1 (инфраструктура страницы) — `TRANSLATE_BATCH` handler в background.js
- DeepL API account с валидным ключом
