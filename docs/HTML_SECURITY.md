# Безопасность HTML контента

## Проблема с v-html

`v-html` в Vue.js может быть опасен из-за XSS (Cross-Site Scripting) атак. Вредоносный HTML может:
- Украсть cookies и токены
- Перенаправить пользователя на фишинговый сайт
- Выполнить произвольный JavaScript код
- Изменить DOM страницы

## Решение: DOMPurify

Мы используем библиотеку **DOMPurify** для санитизации всего HTML контента перед отображением.

### Установка

```bash
pnpm add dompurify
```

### Использование

#### Composable `useSafeHtml`

```typescript
import { useSafeHtml } from '@/composables/useSafeHtml'

const { sanitizeHtml } = useSafeHtml()

// Санитизировать HTML
const safeHtml = sanitizeHtml('<p>Текст с <script>alert("XSS")</script></p>')
// Результат: '<p>Текст с </p>' (script удален)
```

#### Разрешенные HTML теги

По умолчанию разрешены только безопасные теги:
- **Текст**: `<p>`, `<strong>`, `<em>`, `<br>`
- **Заголовки**: `<h2>`, `<h3>`, `<h4>`
- **Списки**: `<ul>`, `<ol>`, `<li>`
- **Ссылки**: `<a>` (только с безопасными href)
- **Цитаты**: `<blockquote>`
- **Код**: `<code>`, `<pre>`

#### Разрешенные атрибуты

- `href` (только безопасные URL: http, https, mailto, tel)
- `title`
- `target` (с автоматическим добавлением `rel="noopener noreferrer"`)

### Примеры

#### ✅ Безопасный HTML (разрешен)

```html
<p>Текст с <strong>выделением</strong></p>
<ul>
  <li>Пункт 1</li>
  <li>Пункт 2</li>
</ul>
<a href="https://example.com">Ссылка</a>
```

#### ❌ Опасный HTML (будет удален)

```html
<script>alert('XSS')</script>
<img src="x" onerror="alert('XSS')">
<a href="javascript:alert('XSS')">Клик</a>
<iframe src="https://evil.com"></iframe>
```

## Где используется

### 1. Публичная страница каталога (`/pages/catalog/[...slug].vue`)

```vue
<script setup>
import { useSafeHtml } from '@/composables/useSafeHtml'

const { sanitizeHtml } = useSafeHtml()

// SEO текст с санитизацией
const seoText = computed(() => {
  const text = currentCategory.value?.seo_text
  return text ? sanitizeHtml(text) : null
})
</script>

<template>
  <div v-html="seoText" />
</template>
```

### 2. Админ панель - preview (`/components/admin/categories/RecursiveMenuItemFormNode.vue`)

```vue
<script setup>
const { sanitizeHtml } = useSafeHtml()
const sanitizedSeoText = computed(() => sanitizeHtml(seoText.value))
</script>

<template>
  <div v-html="sanitizedSeoText" />
</template>
```

## Важные замечания

1. **Санитизация выполняется на клиенте**: На сервере (SSR) HTML не санитизируется, чтобы избежать проблем с jsdom. Санитизация происходит только в браузере.

2. **Доверенные источники**: Контент создается только в админке доверенными пользователями (администраторами), но санитизация все равно необходима как дополнительный уровень защиты.

3. **Производительность**: DOMPurify очень быстрый и не влияет на производительность.

4. **Настройка**: Если нужно разрешить дополнительные теги, обновите конфигурацию в `useSafeHtml.ts`.

## Дополнительные меры безопасности

1. **Content Security Policy (CSP)** - настроить в Nuxt config
2. **HTTP-only cookies** - для токенов аутентификации
3. **HTTPS** - для всех соединений
4. **Валидация на сервере** - дополнительная проверка в RPC функциях

## Ссылки

- [DOMPurify GitHub](https://github.com/cure53/DOMPurify)
- [OWASP XSS Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
- [Vue.js Security Best Practices](https://vuejs.org/guide/best-practices/security.html)
