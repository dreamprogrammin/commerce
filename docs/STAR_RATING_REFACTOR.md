# Star Rating Refactor — Золотые звезды рейтинга

**Статус**: Выполнено
**Дата**: 2026-03-04
**Затронутые компоненты**: `StarRating.vue`, `ProductReviews.vue`, `ReviewFormDialog.vue`, `ReviewCard.vue`

---

## Проблема

Пустые звёзды в компоненте `StarRating.vue` отображались как **контурные** (hollow outline) из-за отсутствия `fill`-класса для неактивного состояния. Это давало слабый визуальный контраст между активными и пустыми звёздами, рейтинг читался плохо.

```
До: ★★★☆☆  ← пустые звёзды — тонкий серый контур
После: ★★★☆☆  ← пустые звёзды — светло-серая заливка, чёткий контраст
```

---

## Решение

Ключевой компонент — `components/product/StarRating.vue`. Все остальные компоненты используют его через `<StarRating>`, поэтому изменение одного файла закрывает весь аудит.

### Логика классов (после рефакторинга)

```vue
<!-- StarRating.vue — иконка звезды -->
<Icon
  name="lucide:star"
  :class="[
    sizeClass,
    getStarState(i) !== 'empty'
      ? 'text-yellow-400 fill-yellow-400'   // активная и half: полная золотая заливка
      : 'text-gray-300 fill-gray-100',      // пустая: светло-серая заливка (не дырявая)
  ]"
/>
```

**До изменения** — пустая звезда:
```
'text-gray-300'               // только цвет обводки, fill не задан → outline
```

**После изменения** — пустая звезда:
```
'text-gray-300 fill-gray-100' // обводка серая + светло-серая заливка
```

---

## Состояния звезды

| Состояние | Когда | Классы Tailwind | Визуал |
|-----------|-------|-----------------|--------|
| `full`    | `i <= Math.floor(value)` | `text-yellow-400 fill-yellow-400` | Ярко-золотая |
| `half`    | `i - 0.5 <= value` | `text-yellow-400 fill-yellow-400` | Золотая (используется иконка `lucide:star-half`) |
| `empty`   | всё остальное | `text-gray-300 fill-gray-100` | Светло-серая |

> **Примечание**: `half`-состояние используется только в `readonly` режиме для отображения дробных средних рейтингов (например, 3.5). В интерактивном режиме (форма отзыва) всегда `full` или `empty`.

---

## Размеры

Компонент поддерживает три размера через пропс `size`:

| `size` | Класс | Использование |
|--------|-------|---------------|
| `sm`   | `w-4 h-4` | `ReviewCard.vue` — звёзды в каждом отзыве |
| `md`   | `w-5 h-5` | `ProductReviews.vue` — средний рейтинг (default) |
| `lg`   | `w-7 h-7` | `ReviewFormDialog.vue`, форма в `ProductReviews.vue` — интерактивный выбор |

---

## Аудит компонентов

### `components/product/StarRating.vue` — ЦЕНТРАЛЬНЫЙ КОМПОНЕНТ

Единственный компонент, где рендерятся иконки звёзд. Все остальные — используют его.

**API:**
```vue
<!-- Readonly отображение (в карточках, деталях) -->
<StarRating :model-value="4.5" readonly size="sm" />

<!-- Интерактивный выбор (форма отзыва) -->
<StarRating v-model="reviewRating" size="lg" />
```

**Hover-эффект** (только в интерактивном режиме):
- `hoverValue` реактивно заполняет звёзды при наведении
- При `mouseleave` сбрасывается на `0`, возвращаясь к выбранному значению
- Кнопка-обёртка имеет `hover:scale-110 transition-transform` для плавного увеличения

---

### `components/product/ReviewCard.vue`

```vue
<StarRating :model-value="review.rating" readonly size="sm" class="mb-2" />
```

- Readonly, size `sm` (w-4 h-4)
- Рейтинг всегда целое число (1–5) из БД

---

### `components/product/ProductReviews.vue`

Два вхождения `StarRating`:

```vue
<!-- 1. Средний рейтинг — может быть дробным (3.7, 4.5) -->
<StarRating :model-value="avgRating || 0" readonly size="md" class="mt-1" />

<!-- 2. Форма написания отзыва -->
<StarRating v-model="reviewRating" size="lg" />
```

Плюс инлайн-иконка в блоке распределения по звёздам (не через `StarRating`):
```vue
<Icon name="lucide:star" class="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
```
Эта иконка всегда активная (жёлтая) — используется как декоративный маркер строки.

---

### `components/product/ReviewFormDialog.vue`

```vue
<StarRating v-model="rating" size="lg" />
```

- Интерактивный, size `lg` (w-7 h-7)
- Дублирует форму отзыва из `ProductReviews.vue` (dialog-версия)

---

### `components/global/ProductCard.vue`

**Рейтинг не отображается** — компонент не рендерит звёзды. Продуктовая карточка показывает только цену, название, изображение и кнопку. Если в будущем нужно добавить рейтинг:

```vue
<!-- Пример добавления рейтинга в ProductCard -->
<div v-if="product.avg_rating" class="flex items-center gap-1 mt-1">
  <StarRating :model-value="product.avg_rating" readonly size="sm" />
  <span class="text-xs text-muted-foreground">({{ product.review_count }})</span>
</div>
```

---

## Почему `fill-gray-100`, а не `fill-transparent`

| Вариант | Результат | Проблема |
|---------|-----------|----------|
| `fill-transparent` | Звезда с контуром, внутри пусто | «Дырявый» вид, слабый контраст |
| `fill-gray-200` | Заметная серая заливка | Может конкурировать с активными |
| `fill-gray-100` ✅ | Еле видимая светло-серая заливка | Оптимальный баланс: форма читается, не отвлекает |

На тёмной теме (`dark:`) `fill-gray-100` будет светлее фона — при необходимости добавить:
```
'text-gray-300 fill-gray-100 dark:fill-gray-800'
```

---

## Использование иконки `lucide:star`

Компонент использует Nuxt Icon (`@nuxt/icon`) с именами:
- `lucide:star` — полная и пустая звезда
- `lucide:star-half` — половина звезды

Атрибут `fill` задаётся через Tailwind-классы (`fill-yellow-400`, `fill-gray-100`), а не через HTML-атрибут `fill="currentColor"`. Это работает потому что Nuxt Icon рендерит инлайн SVG, и Tailwind `fill-*` применяется напрямую к SVG-элементу.

> Не использовать атрибут `:fill="currentColor"` напрямую на `<Icon>` — он не пробрасывается в SVG. Всегда использовать классы `fill-*`.

---

## Связанные файлы

```
components/product/
├── StarRating.vue          ← единственный источник иконок звёзд
├── ReviewCard.vue          ← <StarRating readonly size="sm">
├── ProductReviews.vue      ← <StarRating readonly size="md"> + <StarRating v-model size="lg">
└── ReviewFormDialog.vue    ← <StarRating v-model size="lg">
```
