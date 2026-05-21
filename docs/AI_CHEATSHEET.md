# ⚡ Быстрая шпаргалка для ИИ

> Краткая справка по Uhti Commerce Platform для быстрого старта

---

## 🚀 Быстрый старт

```bash
# Запуск проекта
pnpm dev                    # http://localhost:3000

# Supabase
supabase start              # Локальная БД
supabase db reset           # Сброс с миграциями
supabase gen types typescript --local > types/supabase.ts

# Линтинг
pnpm lint:fix               # Авто-исправление
```

---

## 📁 Структура проекта

```
commerce/
├── components/          # 197 компонентов
│   ├── ui/             # shadcn-nuxt (142)
│   ├── global/         # Общие
│   ├── admin/          # Админка
│   └── product/        # Продукты
├── composables/        # 20 composables
├── pages/              # 36 страниц
├── stores/             # 15 Pinia stores
│   ├── core/          # Auth, profile
│   ├── publicStore/   # Cart, products
│   └── adminStore/    # Админ
├── supabase/
│   ├── functions/     # 7 Edge Functions
│   └── migrations/    # 100+ миграций
└── types/
    └── supabase.ts    # Типы БД (87KB)
```

---

## 🔑 Ключевые концепции

### Двойная архитектура заказов

| Тип | Таблица | Бонусы | User ID |
|-----|---------|--------|---------|
| **Зарегистрированные** | `orders` | ✅ Да | ✅ Да |
| **Гостевые** | `guest_checkouts` | ❌ Нет | ❌ Нет |

### Система бонусов

```
active_bonus_balance    → Доступны для списания
pending_bonus_balance   → Активация через 14 дней

1 бонус = 1 ₸ скидки
```

### Кеширование

```
Level 1: Pinia Store     → Метаданные (бренды, атрибуты)
Level 2: TanStack Query  → Продукты (5 мин stale time)

Результат: -33% API вызовов
```

---

## 💻 Частые задачи

### Создание компонента

```vue
<script setup lang="ts">
interface Props {
  title: string
  isLoading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  isLoading: false
})

const emit = defineEmits<{
  (e: 'click'): void
}>()
</script>

<template>
  <div>
    <Skeleton v-if="isLoading" />
    <div v-else>{{ title }}</div>
  </div>
</template>
```

### Работа с Supabase

```typescript
const supabase = useSupabaseClient<Database>()

// SELECT
const { data, error } = await supabase
  .from('products')
  .select('*, brands(*), product_images(*)')
  .eq('is_active', true)
  .order('created_at', { ascending: false })

// INSERT
const { data, error } = await supabase
  .from('products')
  .insert({ name: 'Товар', price: 1000 })
  .select()
  .single()

// RPC
const { data, error } = await supabase
  .rpc('get_filtered_products', {
    p_category_slug: 'toys',
    p_brand_ids: ['uuid1', 'uuid2']
  })
```

### Создание Pinia Store

```typescript
export const useExampleStore = defineStore('example', () => {
  const items = ref<Item[]>([])
  const isLoading = ref(false)

  async function fetchItems() {
    isLoading.value = true
    try {
      const { data } = await supabase.from('items').select('*')
      items.value = data || []
    } finally {
      isLoading.value = false
    }
  }

  return { items, isLoading, fetchItems }
}, {
  persist: { key: 'uhti-example', pick: ['items'] }
})
```

### Создание RPC функции

```sql
CREATE OR REPLACE FUNCTION public.example_rpc(
    p_param UUID
)
RETURNS TABLE (id UUID, name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT t.id, t.name
    FROM table t
    WHERE t.param_id = p_param;
END;
$$;
```

---

## 🗄️ Основные таблицы

### Каталог
- `products` - Товары
- `product_images` - Галерея с LQIP
- `categories` - Иерархические категории
- `brands` - Бренды
- `attributes` - Динамические атрибуты

### Заказы
- `orders` - Зарегистрированные (с бонусами)
- `guest_checkouts` - Гостевые (без бонусов)
- `order_items` - Товары в заказах

### Пользователи
- `profiles` - Профили (с балансом бонусов)
- `children` - Профили детей
- `wishlist` - Список желаний

---

## 🎯 Важные RPC функции

```sql
-- Каталог
get_filtered_products(...)           -- Фильтрация с пагинацией
get_personalized_recommendations(...) -- Рекомендации

-- Заказы
create_user_order(...)               -- Заказ с бонусами
create_guest_checkout(...)           -- Гостевой заказ
cancel_order(...)                    -- Отмена с возвратом бонусов

-- Бонусы
activate_pending_bonuses()           -- Активация (pg_cron)

-- SEO
get_category_brand_combinations()    -- Комбинации для SEO
generate_category_brand_faq(...)     -- Генерация FAQ
safe_upsert_category_brand_seo(...)  -- Защита уникальных текстов
```

---

## ⚠️ Важные правила

### ❌ НЕ ДЕЛАТЬ

1. **НЕ редактировать** существующие миграции
2. **НЕ обходить** middleware для защищенных маршрутов
3. **НЕ использовать** прямые запросы вместо RPC
4. **НЕ забывать** регенерировать типы после изменений БД

### ✅ ДЕЛАТЬ

1. **Всегда** создавать новые миграции
2. **Всегда** проверять RLS политики
3. **Всегда** использовать RPC для сложных запросов
4. **Всегда** регенерировать типы:
   ```bash
   supabase gen types typescript --local > types/supabase.ts
   ```

---

## 🔧 Полезные команды

```bash
# Development
pnpm dev                              # Запуск dev сервера
pnpm build                            # Production build
pnpm lint:fix                         # Исправить lint ошибки

# Supabase
supabase start                        # Запуск локальной БД
supabase db reset                     # Сброс БД
supabase migration new <name>         # Новая миграция
supabase gen types typescript --local > types/supabase.ts

# Testing
pnpm test                             # Запуск тестов
pnpm test:ui                          # UI для тестов

# SEO
pnpm seo:audit                        # Аудит alt-текстов
pnpm seo:generate                     # Генерация alt-текстов
```

---

## 📊 Производительность

### SSR кеширование

```typescript
'/': { swr: 600 },                    // 10 мин
'/catalog': { swr: 1800 },            // 30 мин
'/catalog/products/**': { swr: 3600 }, // 1 час
'/profile/**': { ssr: false },        // Client-only
```

### Метрики

- **Lighthouse Performance:** 95+
- **TTFB:** < 200ms
- **LCP:** < 2.5s
- **CLS:** < 0.1
- **API вызовы:** -33% (кеширование)

---

## 🔗 Полная документация

- [AI_DOCUMENTATION.md](./AI_DOCUMENTATION.md) - Полная документация для ИИ
- [AI_CODE_PATTERNS.md](./AI_CODE_PATTERNS.md) - Примеры кода и паттерны
- [PROJECT_ARCHITECTURE.md](./PROJECT_ARCHITECTURE.md) - Техническая архитектура
- [CLAUDE.md](../CLAUDE.md) - Инструкции для Claude AI

---

## 🎨 Стек технологий

```
Frontend:  Nuxt 4 + Vue 3 + TypeScript + Tailwind CSS 4
UI:        shadcn-nuxt (142 компонента)
State:     Pinia (15 stores) + TanStack Query
Backend:   Supabase (PostgreSQL + Edge Functions)
Auth:      Supabase Auth (Google OAuth)
Storage:   Supabase Storage (5 buckets)
Deploy:    Vercel (SSR)
```

---

## 📞 Контакты проекта

- **Сайт:** https://uhti.kz
- **Регион:** Казахстан (Алматы)
- **Телефон:** +7-702-537-94-73

---

**Дата создания:** 21 мая 2026  
**Версия:** 1.0
