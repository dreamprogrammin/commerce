# 🚀 Как восстановить недостающие категории и бренды через SQL

## ✅ Что делает скрипт `restore_missing.sql`:

1. **Добавляет только отсутствующие записи** (использует `ON CONFLICT DO NOTHING`)
2. **Не перезаписывает существующие** категории и бренды
3. **Показывает результат** в конце (список всех категорий и брендов)

---

## 📋 Способ 1: Через Supabase Dashboard (РЕКОМЕНДУЕТСЯ)

1. Открой [Supabase Dashboard](https://supabase.com/dashboard)
2. Выбери свой проект
3. Перейди в **SQL Editor**
4. Скопируй содержимое файла `restore_missing.sql`
5. Вставь в редактор
6. Нажми **Run** (или Ctrl+Enter)
7. Проверь результат в таблицах внизу

---

## 📋 Способ 2: Через командную строку

```bash
# Если у тебя есть прямой доступ к PostgreSQL
psql "postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres" -f restore_missing.sql

# Или через Supabase CLI
supabase db execute --file restore_missing.sql
```

---

## 📋 Способ 3: Через pgAdmin / DBeaver

1. Подключись к базе данных
2. Открой SQL редактор
3. Загрузи файл `restore_missing.sql`
4. Выполни скрипт

---

## ✅ Что будет добавлено:

### Бренды (15+):
- LEGO, Mattel, LOL Surprise, BOWA, Sluban, CADA
- MG Toys, Play Smart, Feelo, Gudi, Shantou Yisheng
- FiveStar Toys, My Little Home, MokaToys, Eva Puzzle
- Huanger, Koala Diary, Mermaze, RC Toys, Hola Toys, Polese

### Категории (40+):
- **Корневые:** boys, girls, kiddy, babies, constructors-root, accessories, etc.
- **Уровень 1:** mashinki, kukly, bizibordy, tolokar, katalki, etc.
- **Уровень 2:** radioupravlyaemye-mashinki, kukly-aksessuary, bizikub, etc.

---

## 🔍 Проверка результата

После выполнения скрипт покажет 3 таблицы:

1. **Список всех брендов** (с slug и статусом)
2. **Структура категорий** (дерево с 3 уровнями)
3. **Подсчет** (сколько всего брендов и категорий)

Проверь, что все нужные записи появились!

---

## 🧪 Проверка на сайте

```bash
# Запусти автоматическую проверку
./test_redirects.sh

# Или вручную:
curl -I https://uhti.kz/catalog/boys
curl -I https://uhti.kz/catalog/girls
curl -I https://uhti.kz/brand/lego
curl -I https://uhti.kz/brand/mattel
```

Все должны вернуть `HTTP/2 200` ✅

---

## ⚠️ Важно:

1. **Скрипт безопасен** - не удаляет и не перезаписывает существующие данные
2. **Можно запускать многократно** - добавит только то, чего нет
3. **SEO-поля пустые** - заполни их потом через админку (description, meta_title, etc.)

---

## 🎯 Следующие шаги:

После выполнения скрипта:

1. ✅ Проверь сайт (все категории и бренды должны открываться)
2. ✅ Заполни SEO-поля через админку (опционально, но рекомендуется)
3. ✅ Добавь изображения для категорий и брендов (опционально)
4. ✅ Проверь Google Search Console через неделю (ошибки должны исчезнуть)

---

## 🆘 Если что-то пошло не так:

### Ошибка "duplicate key value violates unique constraint"
Это нормально! Значит категория/бренд уже существует. Скрипт пропустит её.

### Ошибка "relation does not exist"
Проверь, что ты подключен к правильной базе данных.

### Категория не открывается после добавления
1. Проверь `is_active = true` в базе
2. Перезапусти dev сервер: `npm run dev`
3. Очисти кеш: Ctrl+Shift+R в браузере

---

**Время выполнения:** 2-5 минут  
**Приоритет:** 🔥 КРИТИЧНО
