# Браузерные мини-игры

Коллекция браузерных игр: **Go backend** + **TypeScript frontend**.

## Структура

```
backend/          — Go API-сервер
frontend/         — TypeScript (Vite)
  src/
    menu/         — главное меню
    games/
      tower-defense/
      math-columns/
```

## Быстрый старт

### 1. Установка зависимостей

```bash
make install
```

### 2. Сборка фронтенда и запуск

```bash
./run.sh
```

Или через Makefile:

```bash
make run
```

Откройте [http://localhost:8089](http://localhost:8089)

### Разработка (два терминала)

```bash
# Терминал 1 — backend API
make dev-api

# Терминал 2 — frontend с hot reload
make dev-web
```

Frontend dev-сервер: [http://localhost:5173](http://localhost:5173) (проксирует `/api` на `:8089`)

## API

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/health` | Проверка сервера |
| GET | `/api/games` | Каталог игр |
| POST | `/api/math/problem` | Сгенерировать пример `{ level, op }` |
| POST | `/api/math/check` | Проверить ответ `{ id, answer }` |

## Игры

| Игра | Путь | Статус |
|------|------|--------|
| 🌻 Защита от зомби | `/games/tower-defense/` | Готова |
| 📐 Столбик | `/games/math-columns/` | Готова |
| 🐍 Змейка | `/games/snake/` | Скоро |
| 🧱 Арканоид | `/games/breakout/` | Скоро |
| 🃏 Найди пару | `/games/memory/` | Скоро |

## Как добавить игру

1. Добавьте запись в `backend/internal/games/catalog.go`
2. Создайте `frontend/src/games/<название>/` и `frontend/games/<название>/index.html`
3. Подключите entry в `frontend/vite.config.ts`
4. Пересоберите: `make build`

## Tower Defense

Canvas-игра в стиле Plants vs Zombies. Логика полностью на клиенте.

## Столбик

Сложение и вычитание столбиком. Примеры генерируются и проверяются на backend.
Серия — 50 правильных ответов, прогресс отображается мозгом с извилинами.
