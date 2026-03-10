# Восстановить картинки в админке после 10 марта

Egress лимит Supabase обнуляется **10 марта 2026**. После этого нужно вернуть картинки в трёх файлах.

---

## 1. `pages/admin/products/index.vue`

Найти (около строки 120):
```html
<!-- TODO: Убрать скрытие после 10 марта (Экономия Egress) -->
<div class="w-16 h-16 bg-muted rounded-md overflow-hidden relative flex items-center justify-center">
  <span class="text-xs text-muted-foreground">IMG</span>
</div>
```

Заменить на:
```html
<div class="w-16 h-16 bg-muted rounded-md overflow-hidden relative">
  <img
    v-if="product.product_images && product.product_images.length > 0"
    :src="getProductImageUrl(product.product_images[0]?.image_url || null) || '/images/placeholder.svg'"
    :alt="product.name"
    class="w-full h-full object-cover"
    loading="lazy"
  >
  <div
    v-if="product.product_images && product.product_images.length > 1"
    class="absolute bottom-0 right-0 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded-tl-md"
  >
    +{{ product.product_images.length - 1 }}
  </div>
</div>
```

---

## 2. `pages/admin/brands/index.vue`

Найти (около строки 210):
```html
<!-- TODO: Убрать скрытие после 10 марта (Экономия Egress) -->
<TableCell>
  <div class="w-12 h-12 rounded-md bg-muted flex items-center justify-center border">
    <span class="text-xs text-muted-foreground">IMG</span>
  </div>
</TableCell>
```

Заменить на:
```html
<TableCell>
  <div class="w-12 h-12 rounded-md bg-gray-50 flex items-center justify-center overflow-hidden border">
    <img
      :src="getBrandLogoUrl(brand.logo_url)"
      :alt="brand.name"
      class="w-full h-full object-contain p-1"
    >
  </div>
</TableCell>
```

---

## 3. `pages/admin/brands/[id].vue`

Найти (около строки 244):
```html
<!-- TODO: Убрать скрытие после 10 марта (Экономия Egress) -->
<div class="w-12 h-12 rounded-lg bg-muted border flex-shrink-0 flex items-center justify-center">
  <span class="text-xs text-muted-foreground">IMG</span>
</div>
```

Заменить на:
```html
<div class="w-12 h-12 rounded-lg bg-muted border overflow-hidden flex-shrink-0 flex items-center justify-center">
  <img
    v-if="line.logo_url"
    :src="getVariantUrl('product-line-logos', line.logo_url, 'sm')"
    :alt="line.name"
    class="w-full h-full object-contain p-1"
  >
  <Sparkles v-else class="w-6 h-6 text-muted-foreground" />
</div>
```

---

## 4. `components/admin/categories/RecursiveMenuItemFormNode.vue`

Найти (около строки 664):
```html
<!-- TODO: Убрать скрытие после 10 марта (Экономия Egress) -->
<div
  v-if="displayImageUrl"
  class="mt-2 border p-2 rounded-md inline-flex items-center gap-2 bg-muted"
>
  <span class="text-xs text-muted-foreground">IMG скрыто</span>
  <Button ...>...</Button>
</div>
```

Заменить на:
```html
<div
  v-if="displayImageUrl"
  class="mt-2 border p-2 rounded-md inline-block relative bg-background"
>
  <img
    :src="displayImageUrl"
    :alt="`Изображение для ${props.item.name}`"
    class="max-w-[150px] max-h-[80px] object-contain rounded"
    loading="lazy"
  >
  <Button
    variant="destructive"
    size="icon"
    class="absolute -top-2 -right-2 h-6 w-6 rounded-full"
    type="button"
    aria-label="Удалить изображение"
    :disabled="isDeleted"
    @click="removeImage"
  >
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24">
      <path fill="currentColor" d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12z" />
    </svg>
  </Button>
  <div
    v-if="props.item._blurPlaceholder"
    class="absolute bottom-1 left-1 bg-green-500 text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1"
  >
    <Icon name="lucide:sparkles" class="w-2.5 h-2.5" />
    <span>LQIP</span>
  </div>
</div>
```
