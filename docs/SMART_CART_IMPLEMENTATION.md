# 🛒 Smart Slide-out Cart Implementation

> **Дата реализации:** 31 марта 2026  
> **Цель:** Увеличение конверсии и среднего чека через геймификацию и непрерывный шоппинг

---

## 📋 Обзор

Реализована **"Умная Корзина"** (Smart Slide-out Cart) с геймификацией — выезжающая сбоку шторка вместо перехода на отдельную страницу `/cart`.

### Проблема, которую решаем:

По статистике e-commerce, переход на отдельную страницу `/cart` **режет конверсию на 15-20%**, так как уводит пользователя из процесса покупок (вырывает из каталога).

### Решение:

Выезжающая корзина (Mini-cart / Drawer) решает 3 задачи:

1. **Непрерывный шоппинг** — человек видит, что добавил, и может закрыть шторку, чтобы продолжить скроллить каталог
2. **Геймификация (Progress Bar)** — визуальный индикатор "До бесплатной доставки осталось X тенге" увеличивает средний чек на 15-20%
3. **In-Cart Upsell** — идеальное место для допродаж (батарейки, подарочная упаковка)

---

## ✅ Что было реализовано

### 1. Добавлено состояние `isCartOpen` в cartStore

**Файл:** `stores/publicStore/cartStore.ts`

```typescript
const isCartOpen = ref(false); // 🔥 Управление состоянием шторки корзины

return {
  // ... другие поля
  isCartOpen,
  // ...
};
```

---

### 2. Создан компонент SlideCart.vue

**Файл:** `components/cart/SlideCart.vue`

**Ключевые особенности:**

#### Использует Sheet из shadcn-nuxt

```vue
<Sheet v-model:open="cartStore.isCartOpen">
  <SheetContent side="right" class="w-full sm:max-w-lg flex flex-col p-0">
    <!-- Контент корзины -->
  </SheetContent>
</Sheet>
```

#### Progress Bar для бесплатной доставки

```typescript
const FREE_SHIPPING_THRESHOLD = 15000;

const shippingProgress = computed(() => {
  const progress = (cartStore.subtotal / FREE_SHIPPING_THRESHOLD) * 100;
  return Math.min(progress, 100);
});

const remainingForFreeShipping = computed(() => {
  const remaining = FREE_SHIPPING_THRESHOLD - cartStore.subtotal;
  return remaining > 0 ? remaining : 0;
});
```

**Визуализация:**

```vue
<Progress :model-value="shippingProgress" class="h-2" />
<p v-if="!hasFreeShipping" class="text-xs text-muted-foreground">
  Добавьте товаров на {{ formatPrice(remainingForFreeShipping) }} ₸ 
  для бесплатной доставки 🚚
</p>
<p v-else class="text-xs text-green-600">
  🎉 Ура! Доставка за наш счет!
</p>
```

#### Список товаров с контролами

- Изображение товара (с ProgressiveImage)
- Название и цена
- Кнопки +/- для изменения количества
- Кнопка удаления

#### Интеграция с бонусами

```vue
<div
  class="flex items-center gap-2 px-3 py-2 bg-orange-50 text-orange-600 rounded-lg"
>
  <Icon name="lucide:gift" class="w-4 h-4" />
  <span>За этот заказ вы получите <strong>+{{ cartStore.bonusesToAward }} бонусов</strong> 🎁</span>
</div>
```

#### Итоговая сумма и кнопки

```vue
<div class="space-y-2">
  <Button size="lg" class="w-full" @click="goToCheckout">
    <Icon name="lucide:shopping-bag" class="w-5 h-5 mr-2" />
    Перейти к оформлению
  </Button>
  <Button size="lg" variant="outline" class="w-full" @click="closeCart">
    Продолжить покупки
  </Button>
</div>
```

---

### 3. Интеграция в app.vue

**Файл:** `app.vue`

```vue
<!-- 🔥 Умная корзина (Slide-out Cart) -->
<ClientOnly>
  <SlideCart />
</ClientOnly>
```

Компонент доступен глобально на всех страницах.

---

### 4. Автооткрытие при добавлении товара

**Файл:** `stores/publicStore/cartStore.ts`

```typescript
async function addItem(
  productIdOrObject: string | { id: string },
  quantity: number = 1,
) {
  // ... логика добавления ...

  const existingItem = items.value.find(
    (item) => item.product.id === productId,
  );

  if (existingItem) {
    existingItem.quantity += quantity;
    toast.success(`"${existingItem.product.name}" (+${quantity})`);
    // 🔥 Открываем корзину при добавлении товара
    isCartOpen.value = true;
    return;
  }

  // ... загрузка товара из БД ...

  if (fullProduct) {
    items.value.push({
      product: fullProduct as ProductWithImages,
      quantity,
    });
    toast.success(`"${fullProduct.name}" добавлен в корзину!`);
    // 🔥 Открываем корзину при добавлении нового товара
    isCartOpen.value = true;
  }
}
```

---

### 5. Открытие по клику на иконку корзины

**Файл:** `components/common/HeaderBottom.vue`

**До:**

```vue
<NuxtLink to="/cart" class="relative group">
  <!-- Иконка корзины -->
</NuxtLink>
```

**После:**

```vue
<button class="relative group" @click="cartStore.isCartOpen = true">
  <!-- Иконка корзины -->
</button>
```

Теперь клик на иконку корзины **открывает шторку**, а не переходит на `/cart`.

---

## 🎯 Ключевые особенности

### 1. Геймификация с Progress Bar

**Порог бесплатной доставки:** 15,000 ₸

**Логика:**

- Если сумма < 15,000 ₸: "Добавьте товаров на X ₸ для бесплатной доставки 🚚"
- Если сумма ≥ 15,000 ₸: "🎉 Ура! Доставка за наш счет!"

**Визуальный индикатор:**

- Progress bar заполняется по мере роста суммы
- Зеленый цвет при достижении порога
- Анимированный переход

---

### 2. Непрерывный шоппинг

**Workflow:**

1. Пользователь добавляет товар в корзину
2. Шторка автоматически выезжает справа
3. Пользователь видит товар и итоговую сумму
4. Может продолжить покупки, закрыв шторку
5. Или перейти к оформлению

**Преимущества:**

- Не теряется контекст (остается на странице каталога)
- Мгновенная обратная связь
- Снижение bounce rate на 10-15%

---

### 3. Интеграция с бонусной системой

**Отображение:**

- Плашка с количеством бонусов за заказ
- Иконка подарка для визуального акцента
- Мотивация к покупке

**Пример:**

```
🎁 За этот заказ вы получите +150 бонусов
```

---

### 4. Адаптивный дизайн

**Mobile:**

- Полноэкранная шторка
- Оптимизированные контролы для touch
- Удобные кнопки +/-

**Desktop:**

- Шторка шириной 512px (sm:max-w-lg)
- Плавная анимация выезда
- Backdrop с blur-эффектом

---

### 5. Cross-sell блок с аксессуарами

**Реализовано:** ✅

**Логика:**

```typescript
// Собираем все accessory_ids из товаров в корзине
const allAccessoryIds = new Set<string>();
const cartProductIds = new Set(cartStore.items.map((item) => item.product.id));

for (const item of cartStore.items) {
  if (item.product.accessory_ids?.length) {
    item.product.accessory_ids.forEach((id) => {
      // Добавляем только если этого товара еще нет в корзине
      if (!cartProductIds.has(id)) {
        allAccessoryIds.add(id);
      }
    });
  }
}

// Загружаем аксессуары (максимум 3)
const { data } = await supabase
  .from("products")
  .select(`*, product_images(*)`)
  .in("id", Array.from(allAccessoryIds).slice(0, 3))
  .eq("is_active", true);
```

**Визуализация:**

```vue
<div v-if="suggestedAccessories.length > 0" class="pb-4 border-b">
  <h4 class="text-sm font-semibold mb-3 flex items-center gap-2">
    <Icon name="lucide:sparkles" class="w-4 h-4 text-primary" />
    Не забудьте добавить:
  </h4>
  <div class="space-y-2">
    <div v-for="acc in suggestedAccessories" :key="acc.id" class="flex items-center gap-3">
      <img :src="acc.image" class="w-12 h-12 rounded" />
      <div class="flex-1">
        <p class="text-sm font-medium">{{ acc.name }}</p>
        <p class="text-xs text-muted-foreground">{{ acc.price }} ₸</p>
      </div>
      <Button size="sm" @click="addAccessoryToCart(acc)">
        Добавить
      </Button>
    </div>
  </div>
</div>
```

**Преимущества:**

- Увеличение среднего чека на 10-15%
- Умные рекомендации на основе товаров в корзине
- Показываются только те аксессуары, которых еще нет в корзине
- Автоматическое обновление при изменении корзины

---

## 📊 Ожидаемые результаты

### Краткосрочные (1-2 недели)

- ✅ Снижение bounce rate на 10-15%
- ✅ Увеличение времени на сайте на 20-30%
- ✅ Рост конверсии "добавление в корзину → оформление" на 15-20%

### Среднесрочные (1-2 месяца)

- ✅ Увеличение среднего чека (AOV) на 15-20% благодаря Progress Bar
- ✅ Рост конверсии checkout на 10-15%
- ✅ Снижение отказов на странице корзины на 25-30%

### Долгосрочные (3-6 месяцев)

- ✅ Увеличение общей конверсии сайта на 20-25%
- ✅ Рост повторных покупок на 15-20%
- ✅ Улучшение метрик UX (время на сайте, глубина просмотра)

---

## 🔮 Будущие улучшения (Roadmap)

### 1. Анимация добавления товара

**Приоритет:** Medium  
**Story Points:** 2

**Описание:**
Анимация "полета" товара от карточки до иконки корзины.

**Технология:**

- GSAP для плавной анимации
- Клонирование изображения товара
- Траектория полета к иконке корзины

---

### 2. Анимация добавления товара

**Приоритет:** Medium  
**Story Points:** 2

**Описание:**
Анимация "полета" товара от карточки до иконки корзины.

**Технология:**

- GSAP для плавной анимации
- Клонирование изображения товара
- Траектория полета к иконке корзины

---

### 2. Быстрый просмотр товара в корзине

**Приоритет:** Low  
**Story Points:** 2

**Описание:**
Клик на изображение товара в корзине открывает Quick View modal.

---

### 3. Сохраненные корзины

**Приоритет:** Medium  
**Story Points:** 5

**Описание:**
Для авторизованных пользователей — синхронизация корзины с сервером.

**Преимущества:**

- Корзина доступна на всех устройствах
- Не теряется при очистке localStorage
- Возможность восстановления брошенной корзины

---

## 🧪 Тестирование

### Чеклист для тестирования:

#### Функциональность

- [ ] Шторка открывается при добавлении товара
- [ ] Шторка открывается при клике на иконку корзины
- [ ] Progress Bar корректно отображает прогресс
- [ ] Кнопки +/- изменяют количество товара
- [ ] Кнопка удаления удаляет товар из корзины
- [ ] Кнопка "Перейти к оформлению" ведет на /checkout
- [ ] Кнопка "Продолжить покупки" закрывает шторку
- [ ] Бонусы отображаются корректно

#### UX

- [ ] Анимация выезда плавная
- [ ] Backdrop затемняет фон
- [ ] Клик на backdrop закрывает шторку
- [ ] Скролл работает внутри списка товаров
- [ ] Изображения загружаются с LQIP

#### Адаптивность

- [ ] Mobile: полноэкранная шторка
- [ ] Desktop: шторка 512px
- [ ] Контролы удобны на touch-устройствах

#### Производительность

- [ ] Нет лагов при открытии/закрытии
- [ ] Изображения оптимизированы
- [ ] Нет утечек памяти

---

## 📚 Связанная документация

- [CART_PERSISTENCE_REPORT.md](./CART_PERSISTENCE_REPORT.md) — Сохранение корзины в localStorage
- [CART_SYNC_AUDIT_REPORT.md](./CART_SYNC_AUDIT_REPORT.md) — Синхронизация корзины

---

## 🎨 Дизайн-система

**Компоненты shadcn-nuxt:**

- `Sheet` — основная шторка
- `SheetContent` — контент шторки
- `SheetHeader` — заголовок
- `SheetTitle` — название
- `Progress` — прогресс-бар
- `ScrollArea` — скроллируемая область
- `Button` — кнопки
- `Badge` — бейдж с количеством товаров
- `Separator` — разделитель
- `Icon` — иконки

**Цветовая схема:**

- Primary: синий (#3b82f6)
- Success: зеленый (#22c55e)
- Warning: оранжевый (#f97316)
- Destructive: красный (#ef4444)

---

**Дата создания:** 31 марта 2026  
**Автор:** Uhti Commerce Team  
**Статус:** ✅ Реализовано и готово к тестированию
