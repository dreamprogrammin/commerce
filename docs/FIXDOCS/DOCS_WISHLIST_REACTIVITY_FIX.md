# FIX: Реактивность кнопки "В избранное" (Wishlist Button Reactivity)

**Дата:** 2026-02-28 (обновлено 2026-03-01)
**Статус:** Исправлено

---

## Симптомы

### Фикс 1 (2026-02-28)
- При клике на иконку сердечка на карточке товара кнопка не меняла визуальное состояние
- Товар реально добавлялся в БД, но закрашенное сердечко появлялось только после перехода на страницу «Избранное» и обратно
- Неавторизованный пользователь видел только `toast`, без открытия модального окна входа

### Фикс 2 (2026-03-01) — Глобальная инициализация + ошибка 23505
- При первом заходе в каталог сердечки уже добавленных товаров не закрашены — `wishlistProductIds` пуст
- При клике на «пустое» сердечко уже избранного товара: `23505 duplicate key value violates unique constraint "wishlist_pkey"`
- Сердечки корректно отображались только после физического посещения `/profile/wishlist`

---

## Причина (Root Cause)

### Фикс 1

#### 1. Отсутствие Optimistic Update в `toggleWishlist`

**Файл:** `stores/publicStore/wishlistStore.ts`

Старый код:
1. Выполнял запрос к Supabase (INSERT / DELETE)
2. Только после успешного ответа вызывал `await fetchWishlistProducts()`
3. `fetchWishlistProducts()` делал ещё один запрос к БД для получения актуального списка

Итого: **2 сетевых round-trip** перед обновлением UI. Пользователь видел задержку или вовсе не замечал изменения, если уходил со страницы.

#### 2. Некорректный UX для неавторизованных пользователей

**Файл:** `components/product/WishlistButton.vue`

Вместо открытия модального окна входа (`openLoginModal()`) компонент показывал `toast.info()`, который легко пропустить.

---

### Фикс 2

#### 3. Отсутствие глобальной инициализации `wishlistProductIds`

**Файл:** `stores/publicStore/wishlistStore.ts`, `app.vue`

`wishlistProductIds` заполнялся только когда страница явно вызывала `fetchWishlistProducts()`. Ни `app.vue`, ни middleware не инициализировали список ID при входе в систему. Следствие: на всех страницах, где `fetchWishlistProducts()` не вызывался напрямую, массив был пустым, и `isProductInWishlist()` всегда возвращал `false`.

#### 4. Ошибка 23505 при повторном INSERT

Так как `wishlistProductIds` был пуст, `toggleWishlist` считал товар «не добавленным» и делал INSERT. БД отвергала его с ошибкой `23505 duplicate key value violates unique constraint`, которая всплывала как Toast.

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

### `stores/publicStore/wishlistStore.ts` — Новый метод `fetchWishlistIds()` + защита от 23505

```typescript
// Лёгкий метод: только ID без загрузки товаров (вызывается глобально при логине)
async function fetchWishlistIds() {
  if (!authStore.isLoggedIn || !authStore.user?.id) {
    wishlistProductIds.value = []
    return
  }
  const { data, error } = await supabase
    .from('wishlist')
    .select('product_id')
    .eq('user_id', authStore.user.id)

  if (!error && data) {
    wishlistProductIds.value = data.map(item => item.product_id)
  }
}

// В toggleWishlist — игнорируем дубликат при INSERT
const { error } = await supabase.from('wishlist').insert({ ... })
if (error && error.code !== '23505') throw error  // ← 23505 = уже добавлено, не ошибка
```

### `app.vue` — Глобальный watcher на пользователя

```typescript
import { useWishlistStore } from '@/stores/publicStore/wishlistStore'
const wishlistStore = useWishlistStore()

const supabaseUser = useSupabaseUser()
watch(supabaseUser, (newUser) => {
  if (!import.meta.client) return
  if (newUser) {
    wishlistStore.fetchWishlistIds() // загружаем ID при логине
  } else {
    wishlistStore.wishlistProductIds = [] // очищаем при выходе
  }
}, { immediate: true }) // immediate: true — срабатывает сразу при монтировании
```

`{ immediate: true }` гарантирует, что при загрузке любой страницы авторизованным пользователем IDs загружаются немедленно.

---

## Критерии приёмки (проверка)

| # | Сценарий | Ожидаемое поведение |
|---|----------|---------------------|
| 1 | Клик на сердечко у авторизованного пользователя | Иконка меняется **мгновенно**, запрос уходит фоном |
| 2 | Клик на сердечко при отсутствии интернета | Иконка мгновенно меняется, затем откатывается назад + Toast с ошибкой |
| 3 | Переход из главной в каталог после добавления | Товар уже отображается с закрашенным сердечком (единый стейт в `wishlistProductIds`) |
| 4 | Клик на сердечко у неавторизованного пользователя | Открывается модальное окно входа |
| 5 | Первый заход в каталог авторизованным пользователем | Сердечки на уже избранных товарах закрашены сразу |
| 6 | Повторный клик на избранный товар из другой вкладки | Нет ошибки 23505, UI корректно обновляется |
| 7 | Выход из аккаунта | `wishlistProductIds` очищается, все сердечки пустые |

---

## Изменённые файлы

| Файл | Тип изменения |
|------|---------------|
| `stores/publicStore/wishlistStore.ts` | Optimistic update + rollback в `toggleWishlist`, удалён вызов `fetchWishlistProducts()` после toggle; добавлен `fetchWishlistIds()`; игнорирование ошибки `23505` при INSERT |
| `components/product/WishlistButton.vue` | Заменён `toast.info()` на `modalStore.openLoginModal()` для неавторизованных пользователей |
| `app.vue` | Добавлен глобальный `watch(supabaseUser)` с `{ immediate: true }` для вызова `fetchWishlistIds()` при логине и очистки при выходе |
