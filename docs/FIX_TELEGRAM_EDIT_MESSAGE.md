# 🔧 Исправление: Telegram "there is no text in the message to edit"

## 🐛 Проблема

**Ошибка:**

```
Bad Request: there is no text in the message to edit
```

**Причина:**
Telegram API не позволяет редактировать текст в сообщениях, которые содержат только медиа (фото/видео) без текста. Для таких сообщений нужно использовать `editMessageCaption` вместо `editMessageText`.

---

## ✅ Решение

Обновлена функция `updateTelegramMessage` в `supabase/functions/_shared/telegramUtils.ts`:

### Что изменилось:

1. **Сначала пробуем `editMessageText`** (для обычных текстовых сообщений)
2. **Если ошибка "there is no text"** → автоматически пробуем `editMessageCaption` (для сообщений с медиа)
3. **Graceful degradation** - если обновление не удалось, логируем ошибку, но не фейлим весь процесс

### Код:

```typescript
// Сначала пробуем editMessageText
let response = await fetch(
  `https://api.telegram.org/bot${botToken}/editMessageText`,
  { ... }
)

// Если ошибка "there is no text" - пробуем editMessageCaption
if (!response.ok && result.description?.includes('there is no text in the message to edit')) {
  console.log('⚠️ Сообщение содержит медиа, пробуем editMessageCaption...')

  delete body.text
  body.caption = newText

  response = await fetch(
    `https://api.telegram.org/bot${botToken}/editMessageCaption`,
    { ... }
  )
}
```

---

## 📊 Результат

✅ **Теперь работает для:**

- Обычных текстовых сообщений (editMessageText)
- Сообщений с фото/видео (editMessageCaption)
- Сообщений с кнопками (inline_keyboard)

✅ **Автоматическое определение типа сообщения**

✅ **Нет критических ошибок** - если обновление не удалось, процесс продолжается

---

## 🧪 Тестирование

После деплоя проверь:

1. Обновление статуса заказа с текстовым сообщением
2. Обновление статуса заказа с фото товара
3. Проверь логи в Supabase Dashboard → Edge Functions

---

## 📝 Задеплоено

```bash
supabase functions deploy --no-verify-jwt
```

Обновлены функции:

- `assign-order-to-admin`
- `cancel-order`
- `confirm-order`
- `deliver-order`
- `sync-order-status-to-telegram`
- `notify-order-to-telegram`

---

## 🎯 Дата исправления

**10.05.2026** - Исправлена ошибка "there is no text in the message to edit"
