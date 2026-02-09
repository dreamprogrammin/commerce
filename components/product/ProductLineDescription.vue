<script setup lang="ts">
const props = defineProps<{
  productLine: {
    id: string
    name: string
    description?: string | null
    seo_description?: string | null
  }
}>()

// Приоритет: seo_description > description
const displayDescription = computed(() => {
  return props.productLine.seo_description || props.productLine.description || null
})
</script>

<template>
  <div
    v-if="displayDescription"
    class="product-line-description text-foreground"
  >
    <div
      class="text-sm md:text-base leading-relaxed"
      v-html="displayDescription"
    />
  </div>
</template>

<style>
/* НЕ scoped стили для корректной работы с v-html */

/* Базовые стили для элементов БЕЗ inline-стилей */
.product-line-description h1:not([style]) {
  font-size: 2rem;
  font-weight: 700;
  line-height: 1.2;
  margin-top: 2rem;
  margin-bottom: 1rem;
}

.product-line-description h2:not([style]) {
  font-size: 1.75rem;
  font-weight: 700;
  line-height: 1.3;
  margin-top: 1.75rem;
  margin-bottom: 1rem;
}

.product-line-description h3:not([style]) {
  font-size: 1.5rem;
  font-weight: 600;
  line-height: 1.4;
  margin-top: 1.5rem;
  margin-bottom: 0.75rem;
}

.product-line-description h4:not([style]) {
  font-size: 1.25rem;
  font-weight: 600;
  line-height: 1.4;
  margin-top: 1.25rem;
  margin-bottom: 0.75rem;
}

.product-line-description p:not([style]) {
  font-size: 1rem;
  line-height: 1.7;
  margin-bottom: 1rem;
}

.product-line-description ul:not([style]),
.product-line-description ol:not([style]) {
  list-style-position: outside;
  margin-bottom: 1.25rem;
  padding-left: 1.25rem;
}

.product-line-description ul:not([style]) {
  list-style-type: disc;
}

.product-line-description ol:not([style]) {
  list-style-type: decimal;
}

.product-line-description li:not([style]) {
  line-height: 1.7;
  margin-bottom: 0.5rem;
}

.product-line-description strong {
  font-weight: 600;
}

.product-line-description a {
  color: rgb(var(--color-primary));
  text-decoration: underline;
}

.product-line-description a:hover {
  opacity: 0.8;
}
</style>
