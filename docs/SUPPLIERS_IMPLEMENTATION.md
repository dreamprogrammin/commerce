# Suppliers Management (База поставщиков)

## Что было сделано

### 1. База данных

**Миграция**: `supabase/migrations/20260317000001_create_suppliers_table.sql`

Создана таблица `suppliers`:

| Колонка | Тип | Описание |
|---------|-----|----------|
| `id` | UUID (PK) | Уникальный идентификатор |
| `name` | TEXT NOT NULL | Название (Барахолка точка 45, Ялян Маркет) |
| `contact_person` | TEXT | Имя менеджера |
| `phone` | TEXT | Телефон |
| `email` | TEXT | Email |
| `address` | TEXT | Адрес / точка на рынке |
| `notes` | TEXT | Заметки (условия, мин. заказ, оплата) |
| `created_at` | TIMESTAMPTZ | Дата создания |
| `updated_at` | TIMESTAMPTZ | Дата обновления (авто-триггер) |

Добавлена колонка в `products`:

| Колонка | Тип | Описание |
|---------|-----|----------|
| `supplier_id` | UUID (FK → suppliers.id) | ON DELETE SET NULL |

**Индексы**: `idx_products_supplier_id` для быстрого поиска товаров по поставщику.

**RLS**: Полный доступ только для админов (`profiles.role = 'admin'`).

### 2. Типы

**Файл**: `types/type.ts`

- `Supplier` — интерфейс строки таблицы
- `SupplierInsert` — тип для создания (без id, created_at, updated_at)
- `SupplierUpdate` — тип для обновления (все поля опциональны)
- `ProductFormData` — добавлено поле `supplier_id: string | null`

### 3. Store

**Файл**: `stores/adminStore/adminSuppliersStore.ts`

Pinia store с методами:
- `fetchSuppliers()` — загрузка всех поставщиков
- `fetchSupplierById(id)` — загрузка одного
- `createSupplier(data)` — создание
- `updateSupplier(id, data)` — обновление
- `deleteSupplier(supplier)` — удаление

### 4. Админ-страница

**Файл**: `pages/admin/suppliers/index.vue`

Полноценный CRUD:
- Таблица с колонками: Название, Контактное лицо, Телефон (кликабельный `tel:`), Адрес
- Поиск по названию, контакту, телефону, адресу
- Создание/редактирование через Dialog (модальное окно)
- Удаление с подтверждением через AlertDialog
- Skeleton-загрузка, пустое состояние, счётчик
- Адаптивная верстка (колонки скрываются на мобильных)

### 5. Навигация

**Файл**: `layouts/Admin.vue`

Добавлен пункт "Поставщики" в сайдбар (перед "Оффлайн касса").

### 6. Форма товара

**Файл**: `components/admin/products/ProductForm.vue`

- Добавлен Select-выпадающий список "Поставщик" (между линейкой бренда и страной происхождения)
- Ссылка "Управление поставщиками" под dropdown для быстрого перехода
- `supplier_id` передаётся в ProductInsert/ProductUpdate при сохранении

## Как применить миграцию

```bash
# Локально
supabase db reset

# Продакшн
supabase db push
```

После применения миграции обновить типы:

```bash
supabase gen types typescript --local > types/supabase.ts
```

## Использование

1. Перейти в `/admin/suppliers`
2. Добавить поставщиков (название, контакт, телефон, адрес, заметки)
3. При создании/редактировании товара выбрать поставщика из списка
