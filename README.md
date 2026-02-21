# WhatsApp Translator - Corporate Translation Tool

Корпоративный инструмент для перевода сообщений в WhatsApp Web с использованием DeepL API.

## Возможности

- ✅ Автоматический перевод входящих сообщений
- ✅ Перевод и отправка исходящих сообщений
- ✅ Авторизация пользователей
- ✅ Админ-панель для управления
- ✅ Лимиты на количество символов
- ✅ Кэширование переводов
- ✅ Аудит-лог действий

## Архитектура

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Chrome/Edge    │────▶│   Backend API   │────▶│   DeepL API     │
│   Extension     │     │ (Fastify + TS)  │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │
                        ┌──────┴──────┐
                        │             │
                   ┌────▼────┐  ┌─────▼─────┐
                   │  SQLite │  │   Redis   │
                   │   (DB)  │  │  (Cache)  │
                   └─────────┘  └───────────┘
```

## Быстрый старт

### 1. Запуск через Docker (рекомендуется)

```bash
# Клонировать/скопировать проект
cd whatsapp-translator

# Создать .env файл
cat > .env << EOF
JWT_ACCESS_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
APP_MASTER_KEY=$(openssl rand -hex 32)
CORS_ORIGINS=chrome-extension://YOUR_EXTENSION_ID,https://web.whatsapp.com
EOF

# Запустить
docker-compose up -d

# Проверить логи
docker-compose logs -f backend
```

Сервер будет доступен на `http://localhost:3000`

### 2. Локальный запуск (для разработки)

```bash
# Backend
cd backend

# Установить зависимости
npm install

# Скопировать конфиг
cp .env.example .env

# Инициализировать БД
npx prisma db push

# Запустить Redis (нужен отдельно)
# docker run -d -p 6379:6379 redis:7-alpine

# Запустить сервер
npm run dev
```

### 3. Установка расширения

1. Откройте Chrome/Edge
2. Перейдите в `chrome://extensions/`
3. Включите "Режим разработчика"
4. Нажмите "Загрузить распакованное расширение"
5. Выберите папку `extension`

**Важно:** После загрузки скопируйте ID расширения и добавьте его в `CORS_ORIGINS`.

### 4. Первичная настройка

1. Откройте `http://localhost:3000` в браузере
2. Создайте учётную запись администратора
3. Войдите в админ-панель
4. Перейдите в "DeepL Settings"
5. Введите ваш DeepL API ключ
6. Создайте пользователей

## Конфигурация

### Переменные окружения

| Переменная | Описание | Пример |
|------------|----------|--------|
| `DATABASE_URL` | Путь к SQLite БД | `file:./dev.db` |
| `JWT_ACCESS_SECRET` | Секрет для access токенов | 64 символа hex |
| `JWT_REFRESH_SECRET` | Секрет для refresh токенов | 64 символа hex |
| `APP_MASTER_KEY` | Ключ шифрования (32 байта hex) | 64 символа hex |
| `REDIS_URL` | URL Redis | `redis://localhost:6379` |
| `PORT` | Порт сервера | `3000` |
| `CORS_ORIGINS` | Разрешённые origins | `chrome-extension://xxx` |

### Настройка расширения

В файле `extension/src/background/background.js` измените `API_URL`:

```javascript
const API_URL = 'https://your-server.com'; // ваш сервер
```

## API Endpoints

### Публичные

- `GET /health` - проверка статуса
- `GET /setup/status` - статус первичной настройки
- `POST /setup/create-admin` - создание первого админа
- `GET /languages` - список языков

### Авторизация

- `POST /auth/login` - вход
- `POST /auth/refresh` - обновление токена
- `POST /auth/logout` - выход
- `GET /auth/me` - текущий пользователь

### Перевод (требует авторизации)

- `POST /translate` - перевод текста
- `GET /usage` - статистика использования

### Админка (требует роли admin)

- `GET /admin/users` - список пользователей
- `POST /admin/users` - создание пользователя
- `PATCH /admin/users/:id` - обновление
- `DELETE /admin/users/:id` - удаление
- `GET /admin/settings/deepl` - настройки DeepL
- `POST /admin/settings/deepl` - сохранение настроек
- `GET /admin/audit` - аудит-лог

## Деплой на сервер

### С использованием Docker

```bash
# На сервере
git clone <repo> /opt/whatsapp-translator
cd /opt/whatsapp-translator

# Настроить переменные
nano .env

# Запустить
docker-compose up -d

# Настроить nginx (опционально)
# см. nginx.conf.example
```

### Nginx конфигурация (пример)

```nginx
server {
    listen 443 ssl http2;
    server_name translator.example.com;

    ssl_certificate /etc/letsencrypt/live/translator.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/translator.example.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Безопасность

- ✅ Пароли хэшируются с Argon2
- ✅ DeepL ключ шифруется AES-256-GCM
- ✅ JWT токены с коротким временем жизни
- ✅ Refresh token rotation
- ✅ Rate limiting
- ✅ Тексты сообщений не логируются

## Структура проекта

```
whatsapp-translator/
├── backend/
│   ├── src/
│   │   ├── routes/      # API endpoints
│   │   ├── services/    # Бизнес-логика
│   │   ├── middleware/  # Auth middleware
│   │   ├── utils/       # Утилиты
│   │   └── index.ts     # Entry point
│   ├── prisma/
│   │   └── schema.prisma
│   ├── public/          # Админ-панель
│   └── package.json
├── extension/
│   ├── src/
│   │   ├── background/  # Service Worker
│   │   ├── content/     # WhatsApp injection
│   │   └── popup/       # Popup UI
│   ├── assets/          # Иконки
│   └── manifest.json
├── docker-compose.yml
└── README.md
```

## Известные ограничения

- WhatsApp Web может обновиться и сломать селекторы
- DeepL Free имеет лимит 500,000 символов/месяц
- Расширение работает только в Chrome/Edge

## Troubleshooting

### Расширение не работает

1. Проверьте, что сервер запущен
2. Проверьте CORS_ORIGINS
3. Откройте DevTools расширения и проверьте ошибки

### Ошибка авторизации

1. Очистите storage расширения
2. Перезагрузите страницу WhatsApp Web
3. Войдите заново

### DeepL не работает

1. Проверьте API ключ в админке
2. Убедитесь, что выбран правильный endpoint (Free vs Pro)
3. Проверьте лимиты аккаунта DeepL

## Лицензия

Только для внутреннего корпоративного использования.
