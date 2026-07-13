# Браузерные мини-игры

Коллекция браузерных игр: **Go backend** + **TypeScript frontend** + **PostgreSQL**.

## Структура

```
backend/          — Go API-сервер
frontend/         — TypeScript (Vite)
docker-compose.yml — PostgreSQL
```

## Быстрый старт

### 1. PostgreSQL

```bash
docker compose up -d postgres
```

### 2. Установка и запуск

```bash
make install
./run.sh
```

`run.sh` сам поднимет PostgreSQL через Docker (если установлен) и соберёт фронт.

Откройте [http://localhost:8089](http://localhost:8089)

### Переменные окружения

| Переменная | По умолчанию |
|------------|--------------|
| `DATABASE_URL` | `postgres://games:games@localhost:5432/games?sslmode=disable` |
| `ADMIN_LOGIN` | `admin` |
| `ADMIN_PASSWORD` | `admin` |
| `PORT` | `8089` |

## Пользователи и статистика

- При первом входе пользователь вводит **логин** (и проходит captcha) — он сохраняется в PostgreSQL
- Статистика пишется **только после серверной проверки**:
  - **Столбик**: `correct`/`wrong` и завершение серии — из `POST /api/math/check` (ответ проверяется на сервере; этап/награда выдаётся только при завершении серии)
  - **Tower Defense**: победа/поражение — через одноразовую сессию `start` → `finish` с минимальной длительностью партии
  - **Заполни пропуски**: тексты из админки; сервер случайно убирает слова и проверяет ответ
- Открытого `POST /api/stats` нет: клиент не может сам накрутить счётчики
- Кнопка **Администратор** (справа вверху) → логин `admin` / пароль `admin`
- Страница админа: [http://localhost:8089/admin/](http://localhost:8089/admin/)

## API

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/health` | Проверка сервера |
| GET | `/api/captcha` | Puzzle-captcha |
| GET | `/api/games` | Каталог игр |
| POST | `/api/users/login` | Вход пользователя `{ login, password?, captchaId, captchaAnswer }` |
| PUT | `/api/users/password` | Установить пароль |
| POST | `/api/math/problem` | Сгенерировать пример |
| POST | `/api/math/check` | Проверить ответ; при `userId` пишет статы и может вернуть `stageCompletion` |
| POST | `/api/tower-defense/start` | Начать партию `{ userId }` → `{ sessionId, minDurationMs }` |
| POST | `/api/tower-defense/finish` | Завершить партию `{ sessionId, result: won\|lost }` |
| GET | `/api/fill-blanks/puzzle` | Случайный текст с пропусками |
| POST | `/api/fill-blanks/check` | Проверить слова в пропусках |
| GET/POST/DELETE | `/api/admin/settings/fill-blanks` | Тексты для игры (Bearer) |
| GET | `/api/settings/math-columns` | Размер серии |
| POST | `/api/admin/login` | Вход админа |
| GET | `/api/admin/stats` | Статистика игроков (Bearer) |
| GET | `/api/admin/stages` | Завершённые этапы (Bearer) |
| POST | `/api/admin/verify` | Подтвердить награду этапа (Bearer) |
| GET/PUT | `/api/admin/settings/math-columns` | Настройки серии (Bearer) |
| DELETE | `/api/admin/users/{id}` | Удалить пользователя (Bearer) |

## Игры

| Игра | Путь | Статус |
|------|------|--------|
| Защита от зомби | `/games/tower-defense/` | Готова |
| Столбик | `/games/math-columns/` | Готова |
| Заполни пропуски | `/games/fill-blanks/` | Готова |

## Разработка

```bash
docker compose up -d postgres
make dev-api    # Go :8089
make dev-web    # Vite :5173
```
