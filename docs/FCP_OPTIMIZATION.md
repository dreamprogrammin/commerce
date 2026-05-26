# 🚀 Оптимизация FCP — Что сделано

## ✅ Выполненные оптимизации

### 1. **Убрали блокирующий SSR-запрос**
- `useAsyncData` с `lazy: false` → `lazy: true`
- Категории теперь не блокируют первый рендер

### 2. **Упростили TanStack Query**
- Убрали тяжёлые `JSON.stringify/parse` в query functions
- Убрали `initialData` зависимости от `clientData`
- Отключили `refetchOnMount` и `refetchOnWindowFocus` по умолчанию
- Убрали localStorage persistence (замедляет гидрацию)

### 3. **Оптимизировали плагины**
- `auth-init.client.ts`: убрали `await` в корне, перенесли в `requestIdleCallback`
- `vue-query.ts`: упростили конфигурацию, убрали persistence
- `app.vue`: убрали лишние watchers, отложили telegram modal

### 4. **Nuxt config оптимизации**
- `esbuild` вместо `terser` (быстрее)
- `lightningcss` для минификации CSS
- Улучшенный code splitting
- `renderJsonPayloads: false`
- `componentIslands: true`
- `inlineStyles: false`

### 5. **SEO-схемы в bodyClose**
- JSON-LD скрипты перенесены в конец body
- Не блокируют парсинг HTML

### 6. **Preconnect hints**
- Добавлены для fonts.googleapis.com
- DNS prefetch для fonts.gstatic.com

## 📊 Результаты

**Desktop:**
- Script Evaluation: 1.35 сек (было 2.3 сек) — ↓41% ✅
- Main Thread: 4.8 сек (было 7.3 сек) — ↓34% ✅

**Mobile (требует дополнительной оптимизации):**
- FCP: 3.7 сек
- LCP: 8.3 сек
- TBT: 690 мс
- Performance Score: 44

## 🔧 Дополнительные рекомендации

### Критичные (сделать сейчас):

1. **Проверь размер бандла**
   ```bash
   npm run build
   npx vite-bundle-visualizer
   ```

2. **Оптимизируй изображения**
   - Используй WebP/AVIF
   - Добавь `loading="lazy"` для изображений ниже fold
   - Используй `<NuxtImg>` с `placeholder`

3. **Проверь шрифты**
   - Используй `font-display: swap`
   - Preload критичных шрифтов
   - Рассмотри system fonts для первого рендера

4. **Критичный CSS inline**
   ```ts
   // nuxt.config.ts
   experimental: {
     inlineStyles: (id) => {
       // Inline только критичный CSS
       return id?.includes('critical')
     }
   }
   ```

### Некритичные (можно позже):

1. **Service Worker для кеширования**
2. **HTTP/2 Server Push**
3. **Resource hints (prefetch/preload)**
4. **Lazy load компонентов ниже fold**

## 🧪 Как проверить

1. **Локально:**
   ```bash
   npm run build
   npm run preview
   ```
   Открой DevTools → Lighthouse → Performance

2. **Production:**
   - PageSpeed Insights: https://pagespeed.web.dev/
   - WebPageTest: https://www.webpagetest.org/

3. **Мониторинг:**
   - Chrome User Experience Report
   - Real User Monitoring (RUM)

## 🎯 Целевые метрики

- **FCP:** < 1.8s (хорошо), < 1.0s (отлично)
- **LCP:** < 2.5s (хорошо), < 1.2s (отлично)
- **TTI:** < 3.8s (хорошо), < 2.5s (отлично)
- **TBT:** < 300ms (хорошо), < 150ms (отлично)

## 📝 Что проверить после деплоя

- [ ] FCP улучшился
- [ ] Нет hydration mismatch ошибок
- [ ] Авторизация работает
- [ ] Корзина синхронизируется
- [ ] Рекомендации загружаются
- [ ] Категории отображаются
- [ ] Бренды загружаются
