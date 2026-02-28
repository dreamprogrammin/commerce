# FIX: Реактивность кнопки "В избранное" (Wishlist Button Reactivity)

**Дата:** 2026-02-28
**Статус:** Исправлено

---

## Симптомы

- При клике на иконку сердечка на карточке товара кнопка не меняла визуальное состояние
- Товар реально добавлялся в БД, но закрашенное сердечко появлялось только после перехода на страницу «Избранное» и обратно
- Неавторизованный пользователь видел только `toast`, без открытия модального окна входа

---

## Причина (Root Cause)

### 1. Отсутствие Optimistic Update в `toggleWishlist`

**Файл:** `stores/publicStore/wishlistStore.ts`

Старый код:
1. Выполнял запрос к Supabase (INSERT / DELETE)
2. Только после успешного ответа вызывал `await fetchWishlistProducts()`
3. `fetchWishlistProducts()` делал ещё один запрос к БД для получения актуального списка

Итого: **2 сетевых round-trip** перед обновлением UI. Пользователь видел задержку или вовсе не замечал изменения, если уходил со страницы.

### 2. Некорректный UX для неавторизованных пользователей

**Файл:** `components/product/WishlistButton.vue`

Вместо открытия модального окна входа (`openLoginModal()`) компонент показывал `toast.info()`, который легко пропустить.

---

## Что было исправлено

### `stores/publicStore/wishlistStore.ts` — Optimistic Update + Rollback

```typescript
// ДО (упрощённо):
async function toggleWishlist(productId, productName) {
  // ... DB operation ...
  await fetchWishlistProducts() // ← 2-й запрос, задержка UI
}

// ПОСЛЕ:
async function toggleWishlist(productId, productName) {
  const isCurrentlyInWishlist = wishlistProductIds.value.includes(productId)

  // 1. Мгновенно меняем стейт (Optimistic Update)
  if (isCurrentlyInWishlist) {
    wishlistProductIds.value = wishlistProductIds.value.filter(id => id !== productId)
    wishlistProducts.value = wishlistProducts.value.filter(p => p.id !== productId)
  } else {
    wishlistProductIds.value = [...wishlistProductIds.value, productId]
  }

  try {
    // 2. Отправляем запрос к серверу
    // ... DB operation ...
  } catch (error) {
    // 3. При ошибке — откатываем (Rollback)
    if (isCurrentlyInWishlist) {
      wishlistProductIds.value = [...wishlistProductIds.value, productId]
    } else {
      wishlistProductIds.value = wishlistProductIds.value.filter(id => id !== productId)
      wishlistProducts.value = wishlistProducts.value.filter(p => p.id !== productId)
    }
    toast.error('Ошибка при обновлении избранного', { description: error.message })
  }
}
```

**Результат:** UI обновляется мгновенно. Сетевой запрос уходит фоном. При сбое стейт откатывается и показывается Toast с ошибкой.

---

### `components/product/WishlistButton.vue` — Открытие Login Modal для гостей

```typescript
// ДО:
import { toast } from 'vue-sonner'

async function handleToggle() {
  if (!authStore.isLoggedIn) {
    toast.info('Пожалуйста, войдите, чтобы добавить товар в избранное.')
    return
  }
  ...
}

// ПОСЛЕ:
import { useModalStore } from '@/stores/modal/useModalStore'
const modalStore = useModalStore()

async function handleToggle() {
  if (!authStore.isLoggedIn) {
    modalStore.openLoginModal() // ← открываем модалку входа
    return
  }
  ...
}
```

---

## Почему реактивность работала правильно (не баг)

`isProductInWishlist` в сторе возвращает функцию через `computed`:

```typescript
isProductInWishlist: computed(() => (id: string) => wishlistProductIds.value.includes(id))
```

В компоненте:
```typescript
const isWishlisted = computed(() => wishlistStore.isProductInWishlist(props.productId))
```

Vue 3 отслеживает `wishlistProductIds.value` при вызове внутренней функции **внутри геттера computed компонента** — цепочка реактивности работает корректно. Сердечко перерисовывается сразу, как только `wishlistProductIds` меняется. Поэтому достаточно было исправить момент обновления стейта (Optimistic Update), а не менять структуру данных.

---

## Критерии приёмки (проверка)

| # | Сценарий | Ожидаемое поведение |
|---|----------|---------------------|
| 1 | Клик на сердечко у авторизованного пользователя | Иконка меняется **мгновенно**, запрос уходит фоном |
| 2 | Клик на сердечко при отсутствии интернета | Иконка мгновенно меняется, затем откатывается назад + Toast с ошибкой |
| 3 | Переход из главной в каталог после добавления | Товар уже отображается с закрашенным сердечком (единый стейт в `wishlistProductIds`) |
| 4 | Клик на сердечко у неавторизованного пользователя | Открывается модальное окно входа |

---

## Изменённые файлы

| Файл | Тип изменения |
|------|---------------|
| `stores/publicStore/wishlistStore.ts` | Optimistic update + rollback в `toggleWishlist`, удалён вызов `fetchWishlistProducts()` после toggle |
| `components/product/WishlistButton.vue` | Заменён `toast.info()` на `modalStore.openLoginModal()` для неавторизованных пользователей |
