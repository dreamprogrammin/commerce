# Restock Alert System (Умный список "К закупке")

## Что было сделано

### 1. База данных

**Миграция**: `supabase/migrations/20260317000003_add_restock_columns.sql`

Новые колонки в `products`:

| Колонка | Тип | Default | Описание |
|---------|-----|---------|----------|
| `min_stock_level` | INT NOT NULL | 2 | Минимальный остаток. Если `stock_quantity <= min_stock_level` — товар в списке закупок |
| `restock_quantity` | INT NOT NULL | 5 | Сколько штук нужно дозаказать |

### 2. RPC функция `get_restock_list()`

Возвращает JSON — массив групп по поставщикам. Каждая группа:

```json
{
  "supplier_id": "uuid | null",
  "supplier_name": "Барахолка 3 ряд",
  "supplier_contact": "Дима",
  "supplier_phone": "+7 777 123 4567",
  "supplier_address": "Точка 15",
  "product_count": 3,
  "products": [
    {
      "id": "uuid",
      "name": "Машинка на р/у",
      "sku": "RC-001",
      "price": 5000,
      "stock_quantity": 1,
      "min_stock_level": 2,
      "restock_quantity": 5,
      "sales_count": 45,
      "image_url": "path/to/image"
    }
  ]
}
```

- Товары без поставщика группируются в "Без поставщика"
- Внутри группы товары отсортированы по остатку (0 первыми)
- Группы отсортированы по имени поставщика

### 3. Страница `/admin/restock`

**Файл**: `pages/admin/restock.vue`

**UI**:
- Каждый поставщик — отдельная `Card` с заголовком (имя, контакт, кликабельный телефон, адрес)
- Сворачивание/разворачивание групп по клику на заголовок
- Таблица товаров: картинка, название (ссылка на редактирование), SKU, кол-во продаж, остаток (красный badge для 0), дозаказать, цена
- Общий счётчик товаров к закупке (красный badge)
- Состояние "Все товары в наличии" когда список пуст
- Skeleton-загрузка, кнопка обновления

### 4. Форма товара

**Файл**: `components/admin/products/ProductForm.vue`

Добавлены два поля рядом с "Количество на складе":
- **Мин. остаток** — ниже этого значения товар попадает в закупки
- **Дозаказать (шт)** — рекомендуемое количество для заказа

### 5. Навигация

**Файл**: `layouts/Admin.vue`

Пункт "К закупке" в сайдбаре (между "Поставщики" и "Оффлайн касса").

### 6. Типы

**Файл**: `types/type.ts`

В `ProductFormData` добавлены `min_stock_level` и `restock_quantity`.

## Как работает

1. У каждого товара есть `min_stock_level` (default: 2) и `restock_quantity` (default: 5)
2. Когда `stock_quantity <= min_stock_level` — товар появляется в `/admin/restock`
3. Товары группируются по поставщику (из таблицы `suppliers` через `products.supplier_id`)
4. Администратор видит что и у кого заказывать, с контактами поставщика

## Как применить

```bash
supabase db push
supabase gen types typescript --local > types/supabase.ts
```
