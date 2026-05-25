# Исправление проблем индексации Google

## Проблема

Google сканирует страницы, но не индексирует их из-за:

1. **Конфликта canonical URL** - дублирующиеся URL с trailing slash и без него
2. **Заблокированные в robots.txt URL** - служебные страницы попадают в индекс

## Что было исправлено

### 1. Нормализация URL (trailing slash)

**Файл:** `middleware/trailing-slash.global.ts`

Добавлен middleware для 301 редиректа с trailing slash на версию без него (работает на сервере и клиенте).

### 2. X-Robots-Tag для служебных страниц

**Файл:** `nuxt.config.ts`

Добавлен `X-Robots-Tag: noindex, nofollow` для:

- `/profile/**`
- `/notifications` ⭐ (новое)
- `/checkout`
- `/cart`
- `/order/**`
- `/auth/magic`

Это предотвращает индексацию служебных страниц и ссылок с них.

### 2. Canonical URL

Все canonical URL формируются **без trailing slash**:

- Категории: `https://uhti.kz/catalog/girls/kukly/interaktivnye-kukly`
- Товары: `https://uhti.kz/catalog/products/slug`
- Бренды: `https://uhti.kz/brand/slug`

## Что нужно сделать

### 1. Деплой изменений

```bash
npm run build
# Задеплойте на продакшн
```

### 2. Google Search Console

#### A. Удаление заблокированных URL

1. Перейдите в **Google Search Console** → **Удаление**
2. Создайте запросы на временное удаление для:
   - `https://uhti.kz/__nuxt*`
   - `https://uhti.kz/_nuxt*`
   - `https://uhti.kz/api*`
   - `https://uhti.kz/admin*`
   - `https://uhti.kz/auth*`
   - `https://uhti.kz/profile*`

#### B. Проверка canonical URL

1. Перейдите в **Индексирование** → **Страницы**
2. Найдите проблемную страницу: `https://uhti.kz/catalog/girls/kukly/interaktivnye-kukly`
3. Нажмите **Проверить URL**
4. Посмотрите, какой canonical выбрал Google
5. Если он отличается от вашего - запросите повторное сканирование

#### C. Запрос на повторное сканирование

1. Для каждой проблемной страницы нажмите **Запросить индексирование**
2. Подождите 1-2 недели

### 3. Проверка sitemap

Убедитесь, что в sitemap все URL **без trailing slash**:

```bash
curl https://uhti.kz/sitemap.xml | grep "/$" | grep -v "xml"
```

Если найдены URL с trailing slash - проверьте базу данных:

```sql
SELECT slug, href FROM categories WHERE href LIKE '%/';
```

### 4. Проверка внутренних ссылок

Убедитесь, что на странице `/catalog/all` нет ссылок с trailing slash:

```bash
curl https://uhti.kz/catalog/all | grep -o 'href="[^"]*/"' | grep catalog
```

## Ожидаемый результат

После деплоя и переиндексации:

- ✅ Все URL нормализованы (без trailing slash)
- ✅ Google перестанет показывать ошибки canonical
- ✅ Страницы начнут индексироваться
- ✅ Предупреждения о заблокированных URL исчезнут (через 1-2 месяца)

## Мониторинг

Проверяйте Google Search Console каждую неделю:

1. **Индексирование** → **Страницы** - количество проиндексированных страниц должно расти
2. **Покрытие** → **Исключено** - количество исключенных должно уменьшаться
3. **Производительность** - трафик из поиска должен расти

## Дополнительно

Если проблема сохраняется:

1. Проверьте, что в базе данных `canonical_url = NULL` для всех категорий
2. Проверьте, что нет дублей в sitemap
3. Проверьте, что редирект работает: `curl -I https://uhti.kz/catalog/all/`
