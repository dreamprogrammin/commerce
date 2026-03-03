# Отчёт: Логика «Умного комплекта» (Smart Bundle)

**Дата:** 2026-03-04
**Файл:** `pages/catalog/products/[slug].vue`

---

## Что было ДО (уже реализовано)

| Функция | Статус |
|---------|--------|
| `selectedAccessoryIds` — реактивный массив выбранных аксессуаров | ✅ Было |
| `totalPrice` computed — сумма основного + выбранных аксессуаров | ✅ Было |
| `totalBonuses` computed — суммарные бонусы за комплект | ✅ Было |
| `addToCart()` — добавляет основной товар + каждый аксессуар отдельной позицией | ✅ Было |
| `AccessoriesBlock` — блок «С этим покупают» с бейджами количества | ✅ Было |
| Flip-анимация цены при выборе аксессуаров | ✅ Было |

---

## Что добавлено в этой задаче

### 1. Computed `selectedAccessoriesData`

```typescript
const selectedAccessoriesData = computed(() =>
  (accessories.value || []).filter((acc: ProductWithImages) => selectedAccessoryIds.value.includes(acc.id)),
)
```

Вынесено как отдельный computed чтобы не дублировать `.filter()` в шаблоне и логике.

### 2. Computed `hasAccessoriesSelected`

```typescript
const hasAccessoriesSelected = computed(() => selectedAccessoriesData.value.length > 0)
```

Булевый флаг для удобных `v-if` в шаблоне.

### 3. Синхронизация с корзиной при загрузке (критерий 4)

```typescript
watch(accessories, (newAccessories) => {
  if (!newAccessories?.length) return
  const cartProductIds = new Set(cartStore.items.map(i => i.product.id))
  const preSelected = newAccessories
    .filter((acc) => cartProductIds.has(acc.id))
    .map((acc) => acc.id)
  if (preSelected.length > 0) {
    selectedAccessoryIds.value = [...new Set([...selectedAccessoryIds.value, ...preSelected])]
  }
})
```

**Эффект:** При загрузке страницы товара, если пользователь уже добавил батарейки в корзину ранее — они сразу отображаются как выбранные (синяя рамка + бейдж «1» на блоке «С этим покупают»).

### 4. Лейбл «Итого за комплект» (критерий 1)

```vue
<p class="text-xs font-medium text-muted-foreground mb-1 transition-all">
  {{ hasAccessoriesSelected ? 'Итого за комплект' : 'Цена' }}
</p>
```

Текст меняется динамически: при выборе аксессуара слово «Цена» заменяется на «Итого за комплект».

### 5. Плашка-расшифровка состава (критерий 1)

```vue
<div v-if="hasAccessoriesSelected" class="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
  <span class="text-muted-foreground font-medium truncate max-w-[180px]">{{ product.name }}</span>
  <template v-for="acc in selectedAccessoriesData" :key="acc.id">
    <span class="text-muted-foreground">+</span>
    <span class="text-muted-foreground font-medium">{{ acc.name }}</span>
  </template>
</div>
```

**Результат:** Под ценой появляется строка вида:
`Машинка на радиоуправлении + Батарейки AA 4шт`

Плашка исчезает, если все аксессуары сняты — цена возвращается к исходной (критерий 3).

### 6. Обновление sticky-панели (мобильная, критерий 1)

Sticky-панель внизу экрана теперь показывает:
- `totalPrice` вместо `mainProductPrice.final` — правильная сумма комплекта
- Лейбл «Итого за комплект» в 10px над ценой
- Перечёркнутую оригинальную цену скрываем при наличии аксессуаров (чтобы не путать пользователя)

---

## Схема потока данных

```
Пользователь выбирает батарейки в AccessoriesBlock
         ↓
selectedAccessoryIds = ['uuid-batteries']
         ↓
totalPrice (computed) = 15 400 + 500 = 15 900 ₸
hasAccessoriesSelected = true
selectedAccessoriesData = [{ name: 'Батарейки AA 4шт', ... }]
         ↓
UI обновляется:
  • Лейбл: «Итого за комплект»
  • Flip-анимация: 15 400 → 15 900
  • Плашка: «Машинка + Батарейки AA 4шт»
  • Sticky-панель: 15 900 + «Итого за комплект»
         ↓
Пользователь нажимает «Добавить в корзину»
         ↓
addToCart():
  await cartStore.addItem(product)     → позиция 1: Машинка
  await cartStore.addItem(batteries)   → позиция 2: Батарейки
         ↓
В корзине 2 строки → UPT растёт
```

---

## Критерии приёмки — статус

| # | Критерий | Статус |
|---|----------|--------|
| 1 | Лейбл «Итого за комплект» при выборе аксессуара | ✅ Реализован |
| 1 | Плашка-расшифровка «Машинка + Батарейки» | ✅ Реализована |
| 2 | Массовое добавление в корзину отдельными позициями | ✅ Было (не изменялось) |
| 3 | При снятии аксессуара цена возвращается к исходной | ✅ Работает через реактивность |
| 4 | Бейдж-счётчик виден при загрузке если товар уже в корзине | ✅ Реализован через `watch(accessories)` |

---

## Изменённые файлы

| Файл | Изменение |
|------|-----------|
| `pages/catalog/products/[slug].vue` | Добавлены `selectedAccessoriesData`, `hasAccessoriesSelected`, cart sync watch, лейбл, плашка, обновлена sticky-панель |
