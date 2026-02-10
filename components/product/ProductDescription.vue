<script setup lang="ts">
const props = defineProps<{
  product: {
    id: string
    name: string
    description?: string | null
  }
  isExpanded?: boolean
}>()

const emit = defineEmits<{
  'toggle-expand': []
}>()

// Проверяем, нужна ли кнопка "Читать далее"
const needsExpand = computed(() => {
  if (!props.product.description) return false
  // Убираем HTML теги для подсчета длины текста
  const plainText = props.product.description.replace(/<[^>]*>/g, '').trim()
  return plainText.length > 300
})
</script>

<template>
  <div v-if="product.description" class="space-y-3">
    <div class="product-description text-foreground">
      <div
        class="text-sm text-muted-foreground transition-all duration-300 overflow-hidden"
        :class="!isExpanded && needsExpand ? 'max-h-[6rem]' : 'max-h-none'"
        :style="!isExpanded && needsExpand ? 'display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical;' : ''"
        v-html="product.description"
      />
    </div>

    <button
      v-if="needsExpand"
      type="button"
      class="text-primary text-sm font-medium hover:underline inline-flex items-center gap-1"
      @click="emit('toggle-expand')"
    >
      {{ isExpanded ? 'Свернуть' : 'Читать далее' }}
      <Icon :name="isExpanded ? 'lucide:chevron-up' : 'lucide:chevron-down'" class="w-4 h-4" />
    </button>
  </div>
</template>

<style>
/* НЕ scoped стили для корректной работы с v-html */

/* Базовые стили для элементов БЕЗ inline-стилей */
.product-description h1:not([style]) {
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1.2;
  margin-top: 1.5rem;
  margin-bottom: 0.75rem;
  color: hsl(var(--foreground));
}

.product-description h2:not([style]) {
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.3;
  margin-top: 1.25rem;
  margin-bottom: 0.75rem;
  color: hsl(var(--foreground));
}

.product-description h3:not([style]) {
  font-size: 1.125rem;
  font-weight: 600;
  line-height: 1.4;
  margin-top: 1.125rem;
  margin-bottom: 0.5rem;
  color: hsl(var(--foreground));
}

.product-description h4:not([style]) {
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.4;
  margin-top: 1rem;
  margin-bottom: 0.5rem;
  color: hsl(var(--foreground));
}

.product-description h5:not([style]) {
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.4;
  margin-top: 0.75rem;
  margin-bottom: 0.5rem;
  color: hsl(var(--foreground));
}

.product-description h6:not([style]) {
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1.4;
  margin-top: 0.75rem;
  margin-bottom: 0.5rem;
  color: hsl(var(--foreground));
}

.product-description p:not([style]) {
  font-size: 0.875rem;
  line-height: 1.7;
  margin-bottom: 0.75rem;
  color: hsl(var(--muted-foreground));
}

.product-description ul:not([style]),
.product-description ol:not([style]) {
  list-style-position: outside;
  margin-bottom: 1rem;
  padding-left: 1.5rem;
}

.product-description ul:not([style]) {
  list-style-type: disc;
}

.product-description ol:not([style]) {
  list-style-type: decimal;
}

.product-description li:not([style]) {
  line-height: 1.7;
  margin-bottom: 0.25rem;
  font-size: 0.875rem;
  color: hsl(var(--muted-foreground));
}

.product-description strong {
  font-weight: 600;
}

.product-description em {
  font-style: italic;
}

.product-description a {
  color: hsl(var(--primary));
  text-decoration: underline;
  transition: opacity 0.2s;
}

.product-description a:hover {
  opacity: 0.8;
}

.product-description blockquote:not([style]) {
  border-left: 4px solid hsl(var(--primary));
  padding-left: 1rem;
  margin: 1rem 0;
  font-style: italic;
  color: hsl(var(--muted-foreground));
}

.product-description code:not([style]) {
  background-color: hsl(var(--muted));
  padding: 0.125rem 0.25rem;
  border-radius: 0.25rem;
  font-size: 0.875em;
  font-family: monospace;
}

.product-description pre:not([style]) {
  background-color: hsl(var(--muted));
  padding: 1rem;
  border-radius: 0.5rem;
  overflow-x: auto;
  margin: 1rem 0;
}

.product-description table:not([style]) {
  width: 100%;
  border-collapse: collapse;
  margin: 1rem 0;
}

.product-description th:not([style]),
.product-description td:not([style]) {
  border: 1px solid hsl(var(--border));
  padding: 0.5rem;
  text-align: left;
}

.product-description th:not([style]) {
  background-color: hsl(var(--muted));
  font-weight: 600;
}

.product-description img:not([style]) {
  max-width: 100%;
  height: auto;
  border-radius: 0.5rem;
  margin: 1rem 0;
}

.product-description hr:not([style]) {
  border: none;
  border-top: 1px solid hsl(var(--border));
  margin: 1.5rem 0;
}

/* Элементы С inline-стилями отображаются как есть */
.product-description [style] {
  /* Inline стили имеют приоритет и не переопределяются */
}
</style>
