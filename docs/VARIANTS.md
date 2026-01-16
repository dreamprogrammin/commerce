# 📦 Система контейнеров (Variants)

Централизованная система управления контейнерами и отступами в проекте на основе `class-variance-authority`.

## 📍 Расположение

```
lib/variants.ts
```

## 🎯 Основная концепция

Вместо дублирования CSS-классов контейнеров по всему проекту, используется единая система вариантов, которая обеспечивает:

- ✅ **Single Source of Truth** - все стили контейнеров в одном месте
- ✅ **Типобезопасность** - TypeScript подсказывает доступные варианты
- ✅ **Консистентность** - одинаковые отступы на всех страницах
- ✅ **Масштабируемость** - легко добавлять новые варианты
- ✅ **Читаемость** - понятные названия вместо длинных строк классов

---

## 📖 API Reference

### `carouselContainerVariants`

Функция для создания классов контейнеров с различными вариантами поведения.

#### Варианты

| Вариант     | Описание                                                                | Когда использовать                                                                           |
| ----------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `'desktop'` | На mobile: full width без padding<br>На desktop: ограниченный контейнер | **Карусели товаров**<br>Когда карточки должны "выглядывать" за края на мобильных устройствах |
| `'always'`  | Всегда ограниченный контейнер с padding на всех экранах                 | **Заголовки, текст, формы**<br>Обычный контент, который должен иметь отступы везде           |
| `false`     | Всегда full width с padding на всех экранах                             | **Full-width секции**<br>Секции, которые должны занимать всю ширину экрана                   |

#### CSS классы

```typescript
// contained: 'desktop'
'w-full lg:container lg:max-w-screen-2xl lg:mx-auto lg:px-12'

// contained: 'always'
'w-full container max-w-screen-2xl mx-auto px-4 sm:px-6 md:px-8 lg:px-12'

// contained: false
'w-full px-4 sm:px-6 md:px-8 lg:px-12'
```

---

## 💡 Примеры использования

### 1️⃣ Карусель товаров (mobile full width)

Карусель должна занимать всю ширину на mobile, чтобы карточки "выглядывали", но быть ограниченной на desktop.

```vue
<script setup lang="ts">
import { carouselContainerVariants } from '@/lib/variants'

// Заголовок - всегда с отступами
const headerClass = carouselContainerVariants({ contained: 'always' })

// Карусель - адаптивная
const carouselClass = carouselContainerVariants({ contained: 'desktop' })
</script>

<template>
  <section>
    <!-- Заголовок с отступами на всех экранах -->
    <div :class="headerClass">
      <h2>Популярные товары</h2>
    </div>

    <!-- Карусель: mobile full width, desktop contained -->
    <Carousel :class="carouselClass">
      <CarouselContent>
        <CarouselItem v-for="product in products" :key="product.id">
          <ProductCard :product="product" />
        </CarouselItem>
      </CarouselContent>
    </Carousel>
  </section>
</template>
```

**Результат:**

- 📱 Mobile: карусель на всю ширину, карточки выглядывают
- 💻 Desktop: карусель в контейнере с отступами

---

### 2️⃣ Обычный контент (всегда с отступами)

Текстовые блоки, формы, карточки должны иметь отступы на всех экранах.

```vue
<script setup lang="ts">
import { carouselContainerVariants } from '@/lib/variants'

const containerClass = carouselContainerVariants({ contained: 'always' })
</script>

<template>
  <!-- Блок с отступами на всех экранах -->
  <div :class="containerClass" class="py-8">
    <h1>Заголовок страницы</h1>
    <p>Текстовый контент...</p>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>...</Card>
      <Card>...</Card>
    </div>
  </div>
</template>
```

**Результат:**

- 📱 Mobile: padding: 16px (px-4)
- 🖥️ Tablet: padding: 24px (sm:px-6)
- 💻 Desktop: padding: 48px (lg:px-12)

---

### 3️⃣ Full-width секция с padding

Секция должна занимать всю ширину, но иметь внутренние отступы.

```vue
<script setup lang="ts">
import { carouselContainerVariants } from '@/lib/variants'

const containerClass = carouselContainerVariants({ contained: false })
</script>

<template>
  <!-- Full-width фон с контентом внутри -->
  <section class="bg-primary text-white">
    <div :class="containerClass" class="py-16">
      <h2>Акция дня!</h2>
      <p>Специальное предложение только сегодня</p>
    </div>
  </section>
</template>
```

**Результат:**

- Фон занимает всю ширину экрана
- Контент внутри имеет отступы от краев

---

## 🏗️ Архитектурные решения

### Почему не `app-container`?

❌ **Старый подход:**

```vue
<div class="app-container">
  <h2>Заголовок</h2>
</div>

<div class="app-container">
  <Carousel>...</Carousel>
</div>
```

**Проблемы:**

- Дублирование класса везде
- Нет гибкости (один размер для всех)
- Сложно изменить отступы глобально
- Нет адаптивного поведения для каруселей

✅ **Новый подход:**

```vue
<div :class="alwaysContainedClass">
  <h2>Заголовок</h2>
</div>

<Carousel :class="desktopContainedClass">
  ...
</Carousel>
```

**Преимущества:**

- Один источник правды в `lib/variants.ts`
- Гибкие варианты под разные нужды
- Легко менять отступы глобально
- Адаптивное поведение для каруселей

---

## 🔧 Добавление нового варианта

Если нужен новый тип контейнера:

```typescript
// lib/variants.ts
export const carouselContainerVariants = cva(
  'w-full',
  {
    variants: {
      contained: {
        desktop: '...',
        always: '...',

        // 👇 Новый вариант
        narrow: 'container max-w-4xl mx-auto px-4 sm:px-6',

        false: '...',
      },
    },
    defaultVariants: {
      contained: 'desktop',
    },
  },
)
```

Использование:

```typescript
const narrowClass = carouselContainerVariants({ contained: 'narrow' })
```

---

## 📊 Сравнение вариантов

| Экран               | `'desktop'`                 | `'always'`               | `false`      |
| ------------------- | --------------------------- | ------------------------ | ------------ |
| Mobile (< 640px)    | Full width, **без padding** | px-4 (16px)              | px-4 (16px)  |
| Tablet (640-1024px) | Full width, **без padding** | px-6 (24px)              | px-6 (24px)  |
| Desktop (> 1024px)  | Container + px-12 (48px)    | Container + px-12 (48px) | px-12 (48px) |

---

## 🎨 Визуальные примеры

### `contained: 'desktop'` (для каруселей)

```
Mobile:
┌─────────────────────────────────┐
│[Card][Card][Card][Card]→        │  ← Карточки выглядывают
└─────────────────────────────────┘

Desktop:
┌─────────────────────────────────┐
│    ┌───────────────────┐        │
│    │[Card][Card][Card] │        │  ← В контейнере
│    └───────────────────┘        │
└─────────────────────────────────┘
```

### `contained: 'always'` (для контента)

```
Mobile:
┌─────────────────────────────────┐
│  ┌─────────────────────────┐   │
│  │ Content with padding    │   │
│  └─────────────────────────┘   │
└─────────────────────────────────┘

Desktop:
┌─────────────────────────────────┐
│      ┌───────────────┐          │
│      │ Content here  │          │
│      └───────────────┘          │
└─────────────────────────────────┘
```

---

## 🚀 Best Practices

### ✅ DO (Правильно)

```vue
<script setup>
import { carouselContainerVariants } from '@/lib/variants'

// Создаем классы один раз
const headerClass = carouselContainerVariants({ contained: 'always' })
const carouselClass = carouselContainerVariants({ contained: 'desktop' })
</script>

<template>
  <div :class="headerClass">
    <h2>Title</h2>
  </div>

  <Carousel :class="carouselClass">
    ...
  </Carousel>
</template>
```

### ❌ DON'T (Неправильно)

```vue
<template>
  <!-- Не вызывайте функцию в template -->
  <div :class="carouselContainerVariants({ contained: 'always' })">
    ...
  </div>

  <!-- Не дублируйте app-container -->
  <div class="app-container">
    ...
  </div>

  <!-- Не пишите классы вручную -->
  <div class="container max-w-screen-2xl mx-auto px-4 sm:px-6 md:px-8 lg:px-12">
    ...
  </div>
</template>
```

---

## 📚 Связанные файлы

- `lib/variants.ts` - Определение вариантов
- `components/global/ProductCarousel.vue` - Пример карусели
- `components/home/ProductsCarousel.vue` - Пример home-секции
- `pages/index.vue` - Использование на главной

---

## 🔄 Миграция с `app-container`

### Шаг 1: Определить тип контейнера

- Карусель? → `contained: 'desktop'`
- Обычный контент? → `contained: 'always'`
- Full-width секция? → `contained: false`

### Шаг 2: Заменить класс

```vue
<!-- Было -->
<div class="app-container">

<!-- Стало -->
<script setup>
const containerClass = carouselContainerVariants({ contained: 'always' })
</script>

<template>
  <div :class="containerClass">
```

### Шаг 3: Проверить результат

- Проверьте отступы на всех размерах экрана
- Убедитесь, что карусели корректно "выглядывают" на mobile

---

## 🐛 Troubleshooting

### Карусель не выглядывает на mobile

**Проблема:** Используется `contained: 'always'` вместо `contained: 'desktop'`

**Решение:**

```typescript
// ❌ Неправильно
const carouselClass = carouselContainerVariants({ contained: 'always' })

// ✅ Правильно
const carouselClass = carouselContainerVariants({ contained: 'desktop' })
```

### Контент прилипает к краям экрана

**Проблема:** Используется `contained: 'desktop'` для обычного контента

**Решение:**

```typescript
// ❌ Неправильно
const contentClass = carouselContainerVariants({ contained: 'desktop' })

// ✅ Правильно
const contentClass = carouselContainerVariants({ contained: 'always' })
```

---

## 📝 Changelog

### v1.0.0 (Current)

- ✅ Добавлен вариант `'desktop'` для каруселей
- ✅ Добавлен вариант `'always'` для контента
- ✅ Добавлен вариант `false` для full-width секций
- ✅ TypeScript типы для всех вариантов
- ✅ Документация и примеры

---

## 🤝 Contributing

При добавлении новых вариантов:

1. Опишите use case в комментарии
2. Добавьте пример использования
3. Обновите эту документацию
4. Убедитесь, что TypeScript типы работают

---

**Автор:** Development Team
**Последнее обновление:** 2025
**Версия:** 1.0.0
