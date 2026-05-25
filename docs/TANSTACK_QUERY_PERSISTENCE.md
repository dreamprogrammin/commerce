# TanStack Query Persistence

## Обзор

TanStack Query настроен с persistence в localStorage для сохранения кеша между перезагрузками страницы.

## Как работает

### До persistence

1. Пользователь открывает сайт → загружаются данные с API
2. Пользователь закрывает вкладку → кеш теряется
3. Пользователь открывает сайт снова → **заново загружаются данные**

### После persistence

1. Пользователь открывает сайт → загружаются данные с API → **сохраняются в localStorage**
2. Пользователь закрывает вкладку → **кеш сохранён**
3. Пользователь открывает сайт снова → **данные из localStorage, мгновенная загрузка!**

## Настройки

### Файл: `/plugins/vue-query.ts`

```typescript
persistQueryClient({
  queryClient,
  persister,
  maxAge: 1000 * 60 * 60 * 24, // 24 часа
  dehydrateOptions: {
    shouldDehydrateQuery: (query) => {
      return query.state.status === 'success' // Сохраняем только успешные запросы
    },
  },
})
```

### Параметры:

- **maxAge**: `24 часа` - данные старше удаляются из localStorage
- **throttleTime**: `1 секунда` - сохранение не чаще раза в секунду (производительность)
- **key**: `tanstack-query-cache` - ключ в localStorage
- **shouldDehydrateQuery**: Умное кеширование с контролем
  - ✅ **Публичные данные** (`home-*`, `catalog-*`, `category-*`, `global-*`) - кешируются всегда
  - ⚠️ **Приватные данные** (`user-*`, `profile-*`) - кешируются только с флагом `meta: { allowCache: true }`
  - ❌ Без флага приватные данные НЕ попадают в localStorage

## Что кешируется

### ✅ Автоматически сохраняется в localStorage:

**Публичные данные** (всегда):

- Слайды главной страницы (`global-slides`)
- Популярные категории (`home-popular-categories`)
- Рекомендации (`home-recommendations`)
- Популярные товары (`home-popular`)
- Новые поступления (`home-newest`)
- Баннеры (`home-banners`)
- Каталог товаров (`catalog-products`)

**Приватные данные** (только с флагом `meta: { allowCache: true }`):

- ✅ Последние заказы (`user-orders-recent`) - страница `/profile/index.vue`
- ✅ Последнее избранное (`user-wishlist-recent`) - страница `/profile/index.vue`
- ✅ Последние бонусы (`user-bonus-recent`) - страница `/profile/index.vue`

### ❌ НЕ сохраняется в localStorage:

- Полный список заказов (`user-orders`) - без флага allowCache
- Полный список избранного (`user-wishlist`) - без флага allowCache
- Полная история бонусов (`user-bonus`) - без флага allowCache
- Неудачные запросы (ошибки)
- Данные старше 24 часов
- Данные в процессе загрузки

## Приоритеты загрузки

### Для публичных данных (`home-*`, `catalog-*`, etc.):

1. **SSR state** (если есть) - данные с сервера
2. **localStorage cache** - сохранённый кеш
3. **API request** - свежие данные с сервера

### Для приватных данных (`user-*`, `profile-*`):

1. **SSR state** (если есть) - данные с сервера (но `/profile/**` отключен SSR)
2. **Pinia store cache** - данные из Pinia (с `pinia-plugin-persistedstate`)
3. **API request** - свежие данные с сервера

⚠️ **Важно**: Приватные данные НЕ используют TanStack Query localStorage persistence из соображений безопасности

## Проверка работы

### В DevTools:

1. Открой `Application` → `Local Storage` → `https://uhti.kz`
2. Найди ключ `tanstack-query-cache`
3. Увидишь JSON с кешированными данными

### Тест:

1. Открой главную страницу (данные загрузятся)
2. Перезагрузи страницу (F5)
3. Увидишь **мгновенную загрузку** без skeleton loaders!

## Размер кеша

Типичный размер: **~500KB - 2MB** в зависимости от количества загруженных данных.

### Контроль размера:

- `staleTime: 5 минут` - данные обновляются автоматически
- `gcTime: 10 минут` - старые данные удаляются из памяти
- `maxAge: 24 часа` - старые данные удаляются из localStorage

## Отключение persistence

Если нужно отключить (например, для тестов):

```typescript
// Закомментируй в plugins/vue-query.ts
// persistQueryClient({ ... })
```

Или удали из localStorage вручную:

```javascript
localStorage.removeItem('tanstack-query-cache')
```

## Использование allowCache для приватных данных

### ✅ Правильное использование:

```typescript
// Страница профиля - краткая сводка (быстрая загрузка)
const { data: ordersData } = useQuery({
  queryKey: ['user-orders-recent', 3], // Только последние 3 заказа
  queryFn: async () => await fetchOrders(3),
  staleTime: 2 * 60 * 1000, // 2 минуты
  meta: { allowCache: true }, // ✅ Кешируем для быстрой загрузки dashboard
})
```

### ❌ Неправильное использование:

```typescript
// Полный список заказов - должен быть свежим
const { data: allOrders } = useQuery({
  queryKey: ['user-orders-full'],
  queryFn: async () => await fetchAllOrders(),
  staleTime: 5 * 60 * 1000,
  meta: { allowCache: true }, // ❌ НЕ кешируй полные списки приватных данных
})
```

### Где использовать allowCache:

| Страница                   | Query                         | allowCache | Причина                         |
| -------------------------- | ----------------------------- | ---------- | ------------------------------- |
| `/profile` (dashboard)     | `user-orders-recent` (3 шт)   | ✅ YES     | Быстрая загрузка preview        |
| `/profile` (dashboard)     | `user-wishlist-recent` (4 шт) | ✅ YES     | Быстрая загрузка preview        |
| `/profile/order` (список)  | `user-orders-full`            | ❌ NO      | Свежие данные важнее            |
| `/profile/bonus` (история) | `user-bonus-history`          | ❌ NO      | Финансовые данные всегда свежие |

## Обновление кеша

### Автоматически:

- Каждые 1-5 минут (`staleTime`) - фоновое обновление
- После мутаций (добавление в корзину, избранное) - инвалидация

### Вручную:

```typescript
const queryClient = useQueryClient()
queryClient.invalidateQueries({ queryKey: ['home-popular'] })
```

## Производительность

### Плюсы:

- ⚡ Мгновенная загрузка страниц (0ms вместо 100-500ms)
- 📉 Меньше нагрузки на Supabase API
- 💰 Экономия на API requests (особенно для read-only данных)
- 🚀 Лучший UX - нет skeleton loaders при F5

### Минусы:

- 📦 ~1-2MB в localStorage (незначительно)
- 🔄 Риск устаревших данных (решается через staleTime)

## Best Practices

1. **Контроль кеширования приватных данных**:
   - ✅ Публичные (`home-*`, `catalog-*`, etc.) - кешируются автоматически
   - ⚠️ Приватные (`user-*`, `profile-*`) - добавляй `meta: { allowCache: true }` только где нужна быстрая загрузка
   - ❌ Без флага приватные данные НЕ попадут в localStorage (безопасно по умолчанию)

2. **Когда использовать allowCache для приватных данных**:
   - ✅ Dashboard/главная профиля - краткая сводка (последние 3-5 записей)
   - ✅ Preview данные - для быстрой загрузки UI
   - ❌ Полные списки - пусть загружаются свежими с сервера
   - ❌ Чувствительные данные - платежи, пароли, токены

3. **Правильный staleTime**:
   - 5 минут для публичных данных
   - 1-2 минуты для приватных dashboard данных
   - 30 секунд для критичных данных (баланс, статусы)

4. **Инвалидируй после мутаций** - обновляй кеш после изменений

5. **Мониторь размер localStorage** - не храни большие изображения или огромные списки

## Связанные файлы

- `/plugins/vue-query.ts` - настройка persistence
- `/composables/slides/useSlides.ts` - пример использования Query
- `/pages/index.vue` - использование Query на главной странице
- `package.json` - установленные пакеты:
  - `@tanstack/query-persist-client-core`
  - `@tanstack/query-sync-storage-persister`
