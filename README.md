# 🌱 Привычкин — HabitTracker

Современный трекер привычек с красивым дизайном, стриками, статистикой и анимированным персонажем.

---

## 🚀 Запуск

### 1. Бэкенд (FastAPI, порт 8000)

```bash
cd backend

# Создать виртуальное окружение (рекомендуется)
python -m venv venv
source venv/bin/activate       # Linux/Mac
# venv\Scripts\activate        # Windows

# Установить зависимости
pip install fastapi uvicorn sqlalchemy "passlib[pbkdf2_sha256]" "python-jose[cryptography]" python-multipart

# Запустить
uvicorn main:app --reload --port 8000
```

### 2. Фронтенд (статический сервер, порт 3000)

```bash
cd frontend

# Python (встроенный сервер)
python -m http.server 3000

# ИЛИ Node.js (npx serve)
npx serve -p 3000

# ИЛИ VS Code — Live Server на порт 3000
```

### 3. Открыть в браузере

```
http://localhost:3000
```

---

## 🔑 Тестовый аккаунт

| Логин | Пароль   |
|-------|----------|
| test  | test1234 |

---

## 🧩 Структура проекта

```
habittracker/
├── backend/
│   ├── main.py           # FastAPI приложение
│   ├── requirements.txt  # Зависимости Python
│   └── habittracker.db   # SQLite БД (создаётся автоматически)
└── frontend/
    ├── index.html        # Главная страница
    └── static/
        ├── css/
        │   └── style.css # Все стили
        └── js/
            └── app.js    # Логика приложения
```

---

## 📡 API Endpoints

| Метод  | Путь                        | Описание              |
|--------|-----------------------------|-----------------------|
| POST   | /auth/register              | Регистрация           |
| POST   | /auth/login                 | Вход (OAuth2)         |
| GET    | /habits                     | Список привычек       |
| POST   | /habits                     | Создать привычку      |
| PATCH  | /habits/{id}                | Переименовать         |
| DELETE | /habits/{id}                | Удалить               |
| POST   | /habits/{id}/complete       | Отметить сегодня      |
| POST   | /habits/{id}/backfill       | Отметить прошлую дату |
| GET    | /stats                      | Статистика дня        |
| GET    | /stats/week                 | Данные за неделю      |
| GET    | /export                     | Экспорт JSON          |

---

## ✨ Возможности

- 🔐 Авторизация с JWT токенами
- ✅ Отметка привычек за сегодня и прошлые дни
- ✏️ Редактирование названия двойным кликом
- 🔥 Автоматический подсчёт стриков
- 📊 Недельный график выполнения
- 🏆 Бейджи за 3+ и 7+ дней стрика
- 😊 Анимированный персонаж с настроением
- 🌙 Тёмная / светлая тема
- 📤 Экспорт данных в JSON
- 📱 Мобильная адаптация
