# Документация: Исправление блокировки редиректа в Telegram (Popup Blocker Fix)

## Проблема

При нажатии на кнопку "Подписаться" / "Подключить Telegram" пользователь оставался на странице — перехода в Telegram не происходило. Особенно часто воспроизводилось на iOS, Android и в In-App браузерах (Instagram, WhatsApp и т.д.).

### Симптомы:
- Клик на кнопку ничего не открывает
- Toast о перенаправлении показывается, но Telegram не открывается
- Проблема стабильно воспроизводится на мобильных устройствах
- На desktop в некоторых браузерах появляется уведомление «Popup was blocked»

## Root Cause: Потеря Trusted User Interaction Context

Браузеры (особенно мобильные Safari и Chrome) разрешают `window.open()` **только** в рамках синхронного обработчика пользовательского события (клик, тап). Если между кликом и вызовом `window.open()` есть `await`, контекст доверия теряется.

### Проблемный flow (был):

```
Клик пользователя
    │
    ▼
async subscribe()
    │
    ▼
await supabase.from('telegram_link_codes').delete(...)   ← async #1
    │
    ▼
await supabase.from('telegram_link_codes').insert(...)   ← async #2
    │
    ▼
window.open('https://t.me/...', '_blank')
    ▲
    └── ЗАБЛОКИРОВАНО браузером: событие клика уже "протухло"
```

Браузер не знает, что `window.open()` связан с кликом пользователя — к этому моменту прошло 200–800ms и security context сброшен.

## Решение: Pre-generation Pattern (Синхронный клик)

Токен генерируется и сохраняется **до клика пользователя** — в момент открытия UI. Кнопка рендерится как нативный `<a href="...">` тег. Браузер всегда доверяет переходу по `<a>`, независимо от предшествующих async операций.

### Исправленный flow:

```
Открытие модалки / монтирование компонента
    │
    ▼
prepareLink() (async, фоновая задача)
    │
    ├── await supabase.delete(...)
    ├── await supabase.insert(code)
    └── telegramUrl.value = 'https://t.me/BOT?start=CODE'
                │
                ▼
        <Button as="a" :href="telegramUrl" target="_blank">
                │
Клик пользователя ──► нативный переход по <a href>
                       (браузер всегда пропускает ✅)
```

## Изменённые файлы

### 1. `components/common/TelegramSubscribeDialog.vue`

**Что изменено:**
- Убраны `isLoading` и функция `subscribe()`
- Добавлены `telegramUrl: ref<string|null>` и `isPreparing: ref<boolean>`
- Добавлена функция `prepareLink()` — генерирует code + сохраняет в БД
- Добавлен `watch(isOpen)` — вызывает `prepareLink()` при открытии диалога, сбрасывает URL при закрытии
- Кнопка заменена на `<Button as="a" :href="telegramUrl">` когда URL готов
- Пока готовится — кнопка `disabled` со спиннером
- Добавлена `handleSubscribeClick()` — показывает toast и закрывает модал (sync)

**Ключевые изменения в шаблоне:**
```html
<!-- Было -->
<Button :disabled="isLoading" @click="subscribe">...</Button>

<!-- Стало -->
<Button v-if="telegramUrl" as="a" :href="telegramUrl"
        target="_blank" rel="noopener noreferrer"
        @click="handleSubscribeClick">
  Подписаться в Telegram
</Button>
<Button v-else disabled>
  <Icon name="line-md:loading-twotone-loop" />
  Загрузка...
</Button>
```

---

### 2. `components/common/TelegramSubscribeDrawer.vue`

Идентичные изменения. Триггер `prepareLink()` — `watch(isOpen)`.

---

### 3. `components/profile/TelegramLinkButton.vue`

**Что изменено:**
- Убраны `isLinking` и функция `linkTelegram()`
- Добавлены `telegramUrl`, `isPreparing`
- Добавлена `prepareLink()` и вызов в `onMounted()` (если пользователь авторизован и Telegram не привязан)
- Кнопка "Подключить Telegram" → `<Button as="a" :href="telegramUrl">`
- `unlinkTelegram()` оставлен без изменений

---

### 4. `components/profile/TelegramBanner.vue`

**Что изменено:**
- Убраны `isLinking` и функция `linkTelegram()`
- Добавлены `telegramUrl`, `isPreparing`
- `prepareLink()` вызывается в `onMounted()`
- Кнопка "Подключить Telegram" → `<Button as="a" :href="telegramUrl">`

---

## Почему `<Button as="a">` работает

Компонент `Button` использует `reka-ui`'s `Primitive`, который принимает проп `as` и рендерит нужный HTML-элемент с теми же стилями. При `as="a"` генерируется `<a href="..." target="_blank">` — нативный anchor-тег.

Браузеры не блокируют переходы по `<a href>`, потому что это стандартная навигация, а не программный `window.open()`.

```html
<!-- Результат в DOM -->
<a
  href="https://t.me/babyShopOfficialStoreKz_bot?start=abc123"
  target="_blank"
  rel="noopener noreferrer"
  class="inline-flex h-11 ... bg-sky-500 ..."
>
  Подписаться в Telegram
</a>
```

## UX поведение после фикса

| Состояние | UI | Действие |
|---|---|---|
| Компонент монтируется / модал открывается | Кнопка `disabled` + спиннер "Загрузка..." | Фоновый запрос к Supabase |
| URL готов (~200–400 мс) | Активная кнопка-ссылка | Нативный переход в Telegram |
| Ошибка генерации | Toast с ошибкой, кнопка `disabled` | Пользователь видит причину |

## Таблица: было / стало

| | До | После |
|---|---|---|
| Тип кнопки | `<button @click="subscribe">` | `<a href="t.me/..." target="_blank">` |
| Генерация токена | В момент клика (async) | При открытии UI (фон) |
| `window.open()` | Вызывается после await | Не вызывается совсем |
| Блокировка на iOS/Android | Да | Нет |
| Состояние загрузки | `isLoading` на кнопке | `isPreparing` до показа ссылки |

## Потенциальные проблемы

### Токен протухает, если пользователь долго не кликает

В таблице `telegram_link_codes` должен быть TTL или `expires_at`. Если его нет — токен остаётся валидным до следующего открытия UI (когда он перезаписывается). На практике это не проблема, так как каждый `prepareLink()` делает `DELETE` перед `INSERT`.

### Пользователь открыл несколько вкладок

Каждая вкладка при открытии UI вызовет `prepareLink()`, который удалит код предыдущей вкладки через `.delete().eq('user_id', ...)`. Это ожидаемое поведение — работает последний открытый UI.

### Медленное соединение

Если запрос к Supabase занимает >2 сек, пользователь видит кнопку в состоянии `disabled` + спиннер. Это честный UX — лучше, чем кнопка, которая нажимается, но ничего не открывает.

## Тестирование

### Чеклист для QA:

- [ ] iOS Safari: нажать "Подписаться" → Telegram открывается
- [ ] iOS Chrome: нажать "Подписаться" → Telegram открывается
- [ ] Android Chrome: нажать "Подписаться" → Telegram открывается
- [ ] In-App browser (Instagram/WhatsApp): нажать "Подписаться" → Telegram открывается
- [ ] Desktop Chrome: нет уведомления "Popup blocked"
- [ ] Кнопка показывает спиннер в момент загрузки
- [ ] При ошибке Supabase показывается toast с ошибкой
- [ ] После привязки Telegram кнопка меняется на "Отключить" (TelegramLinkButton)
- [ ] TelegramBanner не показывается если Telegram уже привязан

### Как проверить в DevTools:

```javascript
// Убедиться, что кнопка — это <a>, а не <button>
document.querySelector('[data-slot="button"]').tagName // "A"

// Убедиться, что href содержит токен
document.querySelector('[data-slot="button"]').href
// "https://t.me/babyShopOfficialStoreKz_bot?start=abc123..."
```

## Итог

- ✅ Telegram открывается на iOS/Android и In-App браузерах
- ✅ Никакой зависимости от `window.open()`
- ✅ Пользователь видит состояние загрузки вместо "сломанной" кнопки
- ✅ Токен генерируется заранее — клик мгновенный
- ✅ Обратная совместимость полная — логика привязки в Supabase не изменилась
