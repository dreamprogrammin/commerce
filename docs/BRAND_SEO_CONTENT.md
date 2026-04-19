# SEO-контент для страниц брендов

## Компоненты

### BrandSEOContentRenderer
`components/brand/SEOContentRenderer.vue`

Рендерит структурированный SEO-контент из поля `seo_content` для страниц брендов и линеек.

**Поддерживаемые блоки:**
- `h2` — заголовки с иконками
- `h3` — подзаголовки с иконками
- `p` — параграфы
- `ul` — списки с иконками (по умолчанию `lucide:check-circle`)

---

## Интеграция

### Страница бренда (`pages/brand/[slug].vue`)

```typescript
import { parseHTMLToBlocks } from '@/utils/parseHTMLToBlocks'

const seoBlocks = computed(() => {
  if (!brand.value?.seo_content) return []
  return parseHTMLToBlocks(brand.value.seo_content)
})

// Извлечение текста для Schema.org
const seoContentText = computed(() => {
  if (!seoBlocks.value.length) return ''
  return seoBlocks.value
    .map(block => {
      if (block.type === 'ul') {
        return block.items.map(item => item.text).join(' ')
      }
      return block.text
    })
    .filter(Boolean)
    .join(' ')
    .substring(0, 300)
})
```

**Передача в template:**
```vue
<BrandStandardTemplate
  :brand="brand"
  :seo-blocks="seoBlocks"
/>
```

**Schema.org:**
```typescript
{
  "@type": "Brand",
  "description": seoContentText.value || metaDescription.value,
  // ...
}
```

---

### Страница линейки (`pages/brand/[brandSlug]/[lineSlug].vue`)

Аналогичная интеграция:

```typescript
const seoBlocks = computed(() => {
  if (!productLine.value?.seo_content) return []
  return parseHTMLToBlocks(productLine.value.seo_content)
})

const seoContentText = computed(() => {
  // ... (та же логика)
})
```

**Рендер в template:**
```vue
<div v-if="seoBlocks.length" class="mt-6 md:mt-12 border-t pt-4 md:pt-8">
  <BrandSEOContentRenderer :blocks="seoBlocks" />
</div>
```

---

## Schema.org интеграция

### Приоритет description в Schema.org

1. **seoContentText** (извлечённый текст из `seo_content`, макс 300 символов)
2. **metaDescription** (fallback: `meta_description → seo_description → description`)

### Пример Schema.org Brand

```json
{
  "@context": "https://schema.org",
  "@type": "Brand",
  "@id": "https://uhti.kz/brand/lego#brand",
  "name": "LEGO",
  "description": "LEGO — датский производитель конструкторов для детей...",
  "url": "https://uhti.kz/brand/lego",
  "logo": "https://...",
  "keywords": "LEGO, конструкторы, игрушки",
  "subOrganization": [
    {
      "@type": "Brand",
      "@id": "https://uhti.kz/brand/lego/city#brand",
      "name": "LEGO City",
      "url": "https://uhti.kz/brand/lego/city"
    }
  ]
}
```

---

## Преимущества для SEO

✅ **Структурированный контент** — Google индексирует заголовки, списки, параграфы  
✅ **Schema.org Brand** — текст из `seo_content` попадает в `description`  
✅ **Семантическая разметка** — связь бренда и линеек через `subOrganization`  
✅ **Визуальное оформление** — иконки, отступы, адаптивность  

---

## Пример использования в админке

**Поле `seo_content` в таблице `brands` или `product_lines`:**

```html
<h2 data-icon="lucide:sparkles">Почему выбирают LEGO?</h2>
<p>LEGO — мировой лидер в производстве развивающих конструкторов для детей всех возрастов.</p>

<h3 data-icon="lucide:check-circle">Преимущества</h3>
<ul>
  <li data-icon="lucide:shield-check">Безопасные материалы</li>
  <li data-icon="lucide:award">Международные награды</li>
  <li data-icon="lucide:heart">Развивает креативность</li>
</ul>
```

**Результат:**
- Рендерится как красивый блок с иконками
- Текст попадает в Schema.org `Brand.description`
- Google индексирует структурированный контент
