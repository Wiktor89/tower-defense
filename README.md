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

- При первом входе пользователь вводит **логин** — он сохраняется в PostgreSQL
- Статистика по играм пишется автоматически:
  - **Столбик**: правильные/неправильные ответы, завершённые серии
  - **Tower Defense**: победы и поражения
- Кнопка **Администратор** (справа вверху) → логин `admin` / пароль `admin`
- Страница админа: [http://localhost:8089/admin/](http://localhost:8089/admin/)

## API

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/health` | Проверка сервера |
| GET | `/api/games` | Каталог игр |
| POST | `/api/users/login` | Вход пользователя `{ login }` |
| POST | `/api/stats` | Записать статистику |
| POST | `/api/admin/login` | Вход админа `{ login, password }` |
| GET | `/api/admin/stats` | Статистика всех игроков (Bearer token) |
| POST | `/api/math/problem` | Сгенерировать пример |
| POST | `/api/math/check` | Проверить ответ |

## Игры

| Игра | Путь | Статус |
|------|------|--------|
| 🌻 Защита от зомби | `/games/tower-defense/` | Готова |
| 📐 Столбик | `/games/math-columns/` | Готова |

## Разработка

```bash
docker compose up -d postgres
make dev-api    # Go :8089
make dev-web    # Vite :5173
```
