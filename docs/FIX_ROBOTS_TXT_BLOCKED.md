# 🤖 Исправление: Заблокировано в robots.txt

## 📊 Проблема из Google Search Console

**Статус:** Заблокировано в файле robots.txt
**Дата:** 06.05.2026 - 09.05.2026
**Найдено:** 4 страницы

### Проблемные URL:

```
https://uhti.kz/__nuxt       - служебная директория Nuxt
https://uhti.kz/**/          - wildcard паттерн
https://uhti.kz/auth/*       - страницы авторизации
https://uhti.kz/forgot-password - восстановление пароля
```

---

## 🔍 Причина

Google пытается индексировать служебные страницы, которые **правильно заблокированы** в robots.txt. Это **нормально**, но были небольшие несоответствия между `public/robots.txt` и `nuxt.config.ts`.

---

## ✅ Что исправлено

### 1. Обновлён `public/robots.txt`

**Убрано:**

```
Allow: /search
Allow: /catalog
Allow: /brand
Disallow: /brand/**  ❌ Конфликт!
```

**Причина:** `Allow: /brand` + `Disallow: /brand/**` создавали конфликт

**Результат:** Теперь используется только `Allow: /` (разрешено всё по умолчанию) + явные `Disallow`

### 2. Обновлён `nuxt.config.ts`

**Добавлено в disallow:**

```typescript
disallow: [
  // ... существующие ...
  '/**/', // wildcard паттерны
  '/__nuxt', // служебная директория
  '/_nuxt', // служебная директория
]
```

---

## 📋 Итоговый robots.txt

```
User-agent: *
Allow: /

# Блокируем служебные пути
Disallow: /admin
Disallow: /api
Disallow: /_nuxt
Disallow: /__nuxt

# Блокируем личный кабинет
Disallow: /notifications
Disallow: /profile
Disallow: /cart
Disallow: /checkout
Disallow: /order

# Блокируем авторизацию
Disallow: /auth
Disallow: /register
Disallow: /login
Disallow: /forgot-password
Disallow: /reset-password

# Блокируем wildcard паттерны
Disallow: /**/

Sitemap: https://uhti.kz/sitemap.xml
```

---

## 🧪 Проверка

### 1. Проверь robots.txt онлайн:

```
https://uhti.kz/robots.txt
```

### 2. Проверь в Google Search Console:

1. **Настройки** → **Проверка robots.txt**
2. Введи проблемные URL:
   - `https://uhti.kz/__nuxt`
   - `https://uhti.kz/auth/magic`
   - `https://uhti.kz/forgot-password`
3. Все должны быть **заблокированы** ✅

### 3. Проверь через curl:

```bash
curl https://uhti.kz/robots.txt
```

---

## 📈 Ожидаемый результат

**Через 1-2 недели:**

- ✅ Google пересканирует robots.txt
- ✅ Ошибки "Заблокировано в robots.txt" останутся (это нормально!)
- ✅ Но количество не будет расти
- ✅ Служебные страницы не попадут в индекс

**Важно:** Ошибка "Заблокировано в robots.txt" - это **не проблема**, а подтверждение что блокировка работает! Google просто сообщает, что нашёл эти URL (например, в sitemap или по ссылкам), но не может их проиндексировать из-за robots.txt.

---

## 🎯 Что делать дальше

### Если ошибки продолжают расти:

1. **Проверь sitemap.xml** - убедись что служебные страницы не попали в sitemap
2. **Проверь внутренние ссылки** - убедись что нет ссылок на `/auth/*` или `/__nuxt`
3. **Проверь meta robots** - убедись что на заблокированных страницах стоит `noindex`

### Если всё ОК:

Просто игнорируй эти ошибки в GSC - они показывают что robots.txt **работает правильно** ✅

---

## 📝 Дата исправления

**11.05.2026** - Синхронизированы `robots.txt` и `nuxt.config.ts`, убраны конфликты
