# ⚡ БЫСТРЫЙ СТАРТ: Восстановление после ресета БД

## 🎯 Цель
Восстановить структуру сайта (категории + бренды) за 1-2 часа, чтобы избежать потери SEO-веса.

---

## ✅ ШАГ 1: Создание категорий (30-60 минут)

### Вариант А: Через админку (РЕКОМЕНДУЕТСЯ)
1. Открой `/admin/categories`
2. Используй список из `CRITICAL_RECOVERY_LIST.md`
3. Создавай категории с ТОЧНЫМИ slug из списка
4. Порядок: корневые → подкатегории 1 уровня → подкатегории 2 уровня

### Вариант Б: Через SQL (БЫСТРО, но без SEO-полей)
```bash
# Выполни SQL скрипт
psql -h your-db-host -U your-user -d your-db -f create_categories.sql
```

⚠️ **Важно:** После SQL нужно будет заполнить SEO-поля через админку!

---

## ✅ ШАГ 2: Создание брендов (15-30 минут)

1. Открой `/admin/brands`
2. Создай бренды из списка в `CRITICAL_RECOVERY_LIST.md`
3. Используй ТОЧНЫЕ slug:
   - `lego`, `mattel`, `bowa`, `sluban`, `cada`
   - `mg-toys`, `play-smart`, `feelo`, `gudi`
   - `lol-surprise`, `mermaze`, `shantou-yisheng`

---

## ✅ ШАГ 3: Проверка (5 минут)

```bash
# Запусти автоматическую проверку
./test_redirects.sh

# Или вручную:
curl -I https://uhti.kz/catalog/boys
curl -I https://uhti.kz/catalog/girls
curl -I https://uhti.kz/brand/lego
```

Все должны вернуть `HTTP/2 200` ✅

---

## ✅ ШАГ 4: Деплой (если нужно)

```bash
# Если изменял nuxt.config.ts (добавлял редиректы)
git add nuxt.config.ts
git commit -m "feat: add 301 redirects for old categories"
git push

# Vercel автоматически задеплоит
```

---

## 📊 Чеклист

- [ ] Созданы корневые категории (boys, girls, kiddy, babies, constructors-root, etc.)
- [ ] Созданы подкатегории 1 уровня (mashinki, kukly, bizibordy, etc.)
- [ ] Созданы подкатегории 2 уровня (radioupravlyaemye-mashinki, kukly-aksessuary, etc.)
- [ ] Созданы топ-бренды (lego, mattel, bowa, sluban, cada)
- [ ] Созданы остальные бренды (mg-toys, play-smart, feelo, etc.)
- [ ] Проверены редиректы (все старые URL → 301 → новые URL)
- [ ] Проверены новые страницы (все → 200 OK)
- [ ] Задеплоены изменения (если были)

---

## 🚨 Если что-то пошло не так

### Категория не открывается (404)
1. Проверь slug в базе: `SELECT slug FROM categories WHERE slug = 'boys'`
2. Проверь `is_active = true`
3. Проверь, что нет опечаток в slug

### Бренд не открывается (404)
1. Проверь slug в базе: `SELECT slug FROM brands WHERE slug = 'lego'`
2. Проверь `is_active = true`
3. Проверь, что нет опечаток в slug

### Редирект не работает
1. Проверь `nuxt.config.ts` → `nitro.routeRules`
2. Перезапусти dev сервер: `npm run dev`
3. Очисти кеш браузера

---

## 📚 Полезные файлы

- `CRITICAL_RECOVERY_LIST.md` - Полный список категорий и брендов
- `create_categories.sql` - SQL скрипт для быстрого создания
- `test_redirects.sh` - Автоматическая проверка редиректов
- `docs/DYNAMIC_301_REDIRECTS.md` - Документация по редиректам
- `REDIRECTS_CHEATSHEET.md` - Краткая шпаргалка

---

## 🎯 Результат

После выполнения всех шагов:
- ✅ Все критичные категории работают (200 OK)
- ✅ Все критичные бренды работают (200 OK)
- ✅ Старые URL редиректятся (301 → новые URL)
- ✅ Google видит, что сайт жив
- ✅ SEO-вес сохраняется
- ✅ Трафик не теряется

**Время выполнения:** 1-2 часа  
**Приоритет:** 🔥 КРИТИЧНО
