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
  const plainText = props.product.description.replace(/<[^>]*>/g, '')
  return plainText.length > 200
})

// Обрезанный текст для preview
const truncatedHtml = computed(() => {
  if (!props.product.description) return ''
  if (props.isExpanded) return props.product.description

  // Простое обрезание текста (можно улучшить для сохранения HTML структуры)
  const plainText = props.product.description.replace(/<[^>]*>/g, '')
  if (plainText.length <= 200) return props.product.description

  return plainText.substring(0, 200) + '...'
})
</script>

<template>
  <div v-if="product.description" class="space-y-2">
    <div
      class="product-description text-foreground overflow-hidden transition-all duration-300"
      :class="{ 'line-clamp-3': !isExpanded && needsExpand }"
    >
      <div
        class="text-sm text-muted-foreground"
        v-html="isExpanded ? product.description : truncatedHtml"
      />
    </div>

    <button
      v-if="needsExpand"
      class="text-primary text-sm font-medium hover:underline"
      @click="emit('toggle-expand')"
    >
      {{ isExpanded ? 'Свернуть' : 'Читать далее' }}
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
}

.product-description h2:not([style]) {
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.3;
  margin-top: 1.25rem;
  margin-bottom: 0.75rem;
}

.product-description h3:not([style]) {
  font-size: 1.125rem;
  font-weight: 600;
  line-height: 1.4;
  margin-top: 1.125rem;
  margin-bottom: 0.5rem;
}

.product-description h4:not([style]) {
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.4;
  margin-top: 1rem;
  margin-bottom: 0.5rem;
}

.product-description p:not([style]) {
  font-size: 0.875rem;
  line-height: 1.7;
  margin-bottom: 0.75rem;
}

.product-description ul:not([style]),
.product-description ol:not([style]) {
  list-style-position: outside;
  margin-bottom: 1rem;
  padding-left: 1rem;
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
}

.product-description strong {
  font-weight: 600;
}

.product-description a {
  color: rgb(var(--color-primary));
  text-decoration: underline;
}

.product-description a:hover {
  opacity: 0.8;
}
</style>
