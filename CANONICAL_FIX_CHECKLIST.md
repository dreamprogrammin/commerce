# ✅ ЧЕКЛИСТ: Исправление Canonical URLs

## 1. Применить миграцию на ПРОД

Зайти в Supabase Studio → SQL Editor и выполнить:

```sql
-- Очищаем все жестко зашитые canonical_url
UPDATE public.categories SET canonical_url = NULL WHERE canonical_url IS NOT NULL;
UPDATE public.products SET canonical_url = NULL WHERE canonical_url IS NOT NULL;
UPDATE public.brands SET canonical_url = NULL WHERE canonical_url IS NOT NULL;

-- Проверяем результат
SELECT COUNT(*) as cleared_categories FROM public.categories WHERE canonical_url IS NULL;
```

**Ожидаемый результат:** Все canonical_url теперь NULL, код будет строить их динамически через `category.href`.

---

## 2. Google Search Console - Проверить исправление

1. Открыть GSC → **Индексирование** → **Страницы**
2. Найти раздел **"Вариант страницы с тегом canonical"** (3 страницы)
3. Нажать **"Проверить исправление"**

---

## 3. Что ожидать после проверки

### ❌ Старые пути (останутся серыми - это нормально):

- `/catalog/babies/katalki` → редирект на новый путь
- `/catalog/kukly-aksessuary` → редирект на новый путь
- `/catalog/boys/cars/radioupravlyaemye-mashinki` → редирект на новый путь

**Это нормально!** Им место в "Не проиндексировано", потому что они редиректят.

### ✅ Новые пути (должны быть зелеными):

- `/catalog/girls/kukly/kukly-aksessuary` → **Проиндексировано**
- `/catalog/kiddy/katalki` → **Проиндексировано**
- `/catalog/boys/mashinki/radioupravlyaemye-mashinki` → **Проиндексировано**

---

## 4. Проверить canonical на новых путях

```bash
# Проверить, что canonical теперь правильный (указывает на себя)
curl -s "https://uhti.kz/catalog/girls/kukly/kukly-aksessuary" | grep -oP '<link[^>]*rel="canonical"[^>]*>'

# Ожидаемый результат:
# <link rel="canonical" href="https://uhti.kz/catalog/girls/kukly/kukly-aksessuary">
```

---

## Почему это правильное решение

**До (жестко зашитый canonical в БД):**

```
categories.canonical_url = "/catalog/kiddy/katalki"
↓
Переносим категорию в /catalog/babies/katalki
↓
canonical всё ещё указывает на старый путь /catalog/kiddy/katalki
↓
Google видит дубликат → не индексирует
```

**После (динамический canonical через код):**

```
categories.canonical_url = NULL
↓
Код строит canonical из category.href (текущий путь)
↓
Переносим категорию в /catalog/babies/katalki
↓
canonical автоматически обновляется на /catalog/babies/katalki
↓
Google видит правильный canonical → индексирует
```

---

## Статус

- [x] Миграция создана
- [ ] Миграция применена на ПРОД
- [ ] Нажата кнопка "Проверить исправление" в GSC
- [ ] Проверены новые пути (зеленый статус)

---

**Дата:** 31 марта 2026  
**Время:** 08:42 UTC
