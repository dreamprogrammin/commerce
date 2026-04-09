# Быстрый старт: SEO оптимизация изображений

## Что это дает?

- Твои товары появляются в Google Images
- Бесплатный целевой трафик
- Рост конверсии на 20-40%

## Запуск за 2 минуты

### 1. Установи зависимости (если еще не установлены)

```bash
npm install tsx @supabase/supabase-js
```

### 2. Проверь переменные окружения

Убедись, что в `.env` есть:

```env
NUXT_PUBLIC_SUPABASE_URL=your_supabase_url
NUXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

### 3. Запусти скрипт

```bash
npx tsx scripts/generate-alt-texts.ts
```

### 4. Готово!

Все изображения теперь имеют SEO-оптимизированные alt-тексты.

## Пример результата

### До
```html
<img alt="Изображение товара 1">
```

### После
```html
<img alt="LEGO Конструктор Железный Человек Marvel купить в Казахстане">
```

## Что дальше?

1. Подожди 2-3 недели для индексации Google
2. Проверь результаты в Google Search Console → Performance → Image
3. Наслаждайся ростом трафика 🚀

## Подробная документация

См. [IMAGE_SEO.md](./IMAGE_SEO.md)
