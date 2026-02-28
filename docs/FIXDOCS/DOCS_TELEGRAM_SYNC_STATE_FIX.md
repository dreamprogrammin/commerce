# Документация: Реактивное обновление UI при привязке Telegram (Sync Profile State)

## Проблема

После успешной привязки Telegram (пользователь перешёл в бот → нажал «Старт» → бот записал `telegram_chat_id` в таблицу `profiles`) — кнопка «Подключить Telegram» на странице настроек оставалась активной. Пользователь не видел что привязка произошла и мог попытаться привязать повторно.

### Симптомы:
- Кнопка «Подключить Telegram» не меняется на «Отключить» после возврата из Telegram
- `TelegramBanner.vue` продолжает показываться даже после успешной привязки
- Пользователь вынужден вручную обновлять страницу (`F5`) чтобы увидеть актуальное состояние

## Root Cause

Бэкенд (Telegram-бот) асинхронно обновляет колонку `profiles.telegram_chat_id`. Клиентское приложение не получает уведомления об этом обновлении и продолжает использовать закешированный `profile` из Pinia store.

```
Telegram Bot
    │
    └── UPDATE profiles SET telegram_chat_id = '123456' WHERE id = 'user-uuid'
                                    ↑
                         Клиент ничего не знает об этом
                         profile.value.telegram_chat_id всё ещё null
```

## Решение

### Механизм: Window Visibility Change + Silent Background Refetch

Использован `visibilitychange` event — браузерное событие, которое срабатывает когда:
- Пользователь переключается между вкладками
- Пользователь возвращается из другого приложения (Telegram → браузер)
- Устройство выходит из режима сна

При возврате в браузер (`document.hidden === false`) компоненты тихо вызывают `profileStore.loadProfile(true, false, true)` с флагом `silent: true` — данные обновляются в фоне без видимых лоадеров.

### Flow после фикса:

```
1. Пользователь нажимает <a href="t.me/bot?start=CODE">
        │
        ▼
2. Переходит в приложение Telegram
        │
        ▼
3. Telegram бот: UPDATE profiles SET telegram_chat_id = '...'
        │
        ▼
4. Пользователь возвращается в браузер
        │
        ▼
5. document visibilitychange → hidden: false
        │
        ▼
6. profileStore.loadProfile(force=true, silent=true)
   [фоновый запрос, isLoading не трогается]
        │
        ▼
7. profile.value.telegram_chat_id = '123456'  ← обновилось
        │
        ▼
8. isLinked computed → true
        │
        ▼
9. Кнопка мгновенно меняется: "Подключить" → "Отключить" ✅
   TelegramBanner исчезает ✅
```

---

## Изменённые файлы

### 1. `stores/core/profileStore.ts`

**Что изменено:** добавлен 3-й параметр `silent: boolean = false` в `loadProfile()`.

```typescript
// Было:
async function loadProfile(force = false, waitForCreation = false): Promise<boolean>

// Стало:
async function loadProfile(force = false, waitForCreation = false, silent = false): Promise<boolean>
```

**Логика `silent`:**
```typescript
loadingPromise = (async () => {
  // silent=true — фоновый refetch, не трогаем isLoading чтобы не мигал UI
  if (!silent) isLoading.value = true

  try {
    // ... запрос к Supabase ...
  }
  finally {
    if (!silent) isLoading.value = false
    loadingPromise = null
  }
})()
```

**Важно:** все существующие вызовы `loadProfile()` и `loadProfile(force, waitForCreation)` работают без изменений — параметр `silent` опциональный, по умолчанию `false`.

---

### 2. `components/profile/TelegramLinkButton.vue`

**Что добавлено:**
- Импорт `useEventListener` из `@vueuse/core`
- Слушатель `visibilitychange` — триггерит фоновый refetch при возврате в браузер

```typescript
import { useEventListener } from '@vueuse/core'

// When user returns from Telegram app back to the browser, silently refetch the profile
// so the button switches to "Отключить" immediately without any visible loading state
if (import.meta.client) {
  useEventListener(document, 'visibilitychange', () => {
    if (!document.hidden && user.value && !isLinked.value) {
      profileStore.loadProfile(true, false, true) // force, no waitForCreation, silent
    }
  })
}
```

**Условия срабатывания:**
- `!document.hidden` — пользователь вернулся на вкладку (а не ушёл с неё)
- `user.value` — пользователь авторизован
- `!isLinked.value` — Telegram ещё не привязан (бессмысленно рефрешить если уже привязан)

**Реактивность (уже была):**
```typescript
const isLinked = computed(() => !!profile.value?.telegram_chat_id)
```
`isLinked` автоматически пересчитывается после обновления `profile.value` — Vue reactivity делает всё остальное, перерисовка произойдёт сама.

---

### 3. `components/profile/TelegramBanner.vue`

Идентичные изменения. При возврате в браузер — баннер исчезает автоматически как только `isLinked` становится `true`.

---

## Архитектурные решения

### Почему `visibilitychange`, а не `focus`?

| Событие | Desktop | iOS Safari | Android Chrome | In-App |
|---|---|---|---|---|
| `window focus` | ✅ | ⚠️ Не всегда | ⚠️ Не всегда | ❌ |
| `document visibilitychange` | ✅ | ✅ | ✅ | ✅ |

`visibilitychange` — стандарт W3C, работает на всех платформах. `focus` на мобильных может не сработать при переключении между приложениями (особенно в iOS).

### Почему `silent: true`, а не новый метод?

Минимальные изменения: добавление одного параметра к существующей функции вместо создания дублирующего метода `refreshProfileSilently()`. Все существующие вызовы не затронуты.

### Почему `import.meta.client`?

Компонент рендерится на SSR (Nuxt). `document` недоступен на сервере. `import.meta.client` гарантирует что listener регистрируется только в браузере. `@vueuse/core`'s `useEventListener` также имеет встроенную защиту, но явная проверка делает намерение очевидным.

### Почему listener в компоненте, а не в `profileStore`?

Слушатель активен только пока виден компонент привязки. Это принцип наименьшего удивления — store не должен самостоятельно слушать DOM-события. Когда пользователь уходит со страницы настроек, `useEventListener` из `@vueuse/core` автоматически отписывается при `onUnmounted`.

---

## UX поведение после фикса

### Сценарий "happy path":

1. Открыта страница настроек → кнопка «Подключить Telegram» + спиннер 200ms → кнопка-ссылка активна
2. Клик → переход в Telegram (нативный `<a href>`)
3. В Telegram: нажать «Старт» → бот отвечает «Аккаунт привязан!»
4. Вернуться в браузер → `visibilitychange` → фоновый fetch
5. **Кнопка автоматически меняется на «Отключить»** — без перезагрузки страницы

### Время реакции:

- `visibilitychange` срабатывает немедленно при возврате в браузер
- Supabase `SELECT * FROM profiles` — ~50–200 мс
- Итого: кнопка обновляется через **~100–300 мс** после возврата на вкладку

### Состояния кнопки:

| Состояние `profile.telegram_chat_id` | UI |
|---|---|
| `null` (не привязан) | `<a href="t.me/...">Подключить Telegram</a>` |
| Генерируется токен | `<button disabled>Загрузка...</button>` |
| `'123456...'` (привязан) | `<button @click="unlink">Отключить</button>` |

---

## Потенциальные edge cases

### Пользователь вернулся до того, как бот записал `telegram_chat_id`

Возможна небольшая гонка (бот медленный). В этом случае `visibilitychange` сработает, fetch вернёт старые данные, кнопка не изменится. Следующий `visibilitychange` (например, если пользователь ещё раз переключится) исправит ситуацию.

Критичности нет — пользователь видит «Подключить» → кнопка уже является готовой ссылкой с новым токеном (если модал был открыт) или нужно снова открыть.

### Частые переключения вкладок

`!isLinked.value` условие предотвращает лишние запросы после успешной привязки. До привязки — каждый `visibilitychange` делает один `SELECT` запрос ~50ms, что незначительно.

### SSR

`if (import.meta.client)` — listener регистрируется только в браузере. На сервере нет ни `document`, ни необходимости слушать события.

---

## Тестирование

### Чеклист:

- [ ] Нажать «Подключить Telegram» → перейти в Telegram → нажать «Старт»
- [ ] Вернуться в браузер: кнопка должна измениться на «Отключить» **без перезагрузки**
- [ ] `TelegramBanner.vue` должен исчезнуть автоматически
- [ ] Toast «Telegram подключён» отображается при смене состояния (через `unlinkTelegram`) — проверить что не ломается
- [ ] После нажатия «Отключить» → `telegram_chat_id` удаляется → кнопка возвращается в «Подключить»
- [ ] Быстрое переключение вкладок не вызывает дополнительных запросов если `isLinked === true`
- [ ] В DevTools → Network: при `visibilitychange` виден только `SELECT` запрос, без `isLoading` скелетонов в UI

### Проверка в DevTools:

```javascript
// Убедиться что после visibilitychange обновился профиль:
const profileStore = useProfileStore()
profileStore.profile?.telegram_chat_id // должно быть не null

// Убедиться что isLoading не трогался во время silent refetch:
// Добавить console.log в profileStore.loadProfile и проверить что
// при silent=true "isLoading.value = true" не вызывается
```

---

## Файлы, которые были изменены

1. `stores/core/profileStore.ts` — добавлен параметр `silent` в `loadProfile()`
2. `components/profile/TelegramLinkButton.vue` — добавлен `visibilitychange` listener
3. `components/profile/TelegramBanner.vue` — добавлен `visibilitychange` listener

## Итог

- ✅ Кнопка обновляется автоматически при возврате из Telegram
- ✅ Нет видимых лоадеров и мигания UI (silent background refetch)
- ✅ Работает на iOS, Android и In-App браузерах через `visibilitychange`
- ✅ Listener автоматически отписывается при `onUnmounted` (через `@vueuse/core`)
- ✅ Все существующие вызовы `loadProfile()` работают без изменений
- ✅ Нет лишних запросов после успешной привязки (`!isLinked.value` guard)
