<script setup lang="ts">
const props = defineProps<{
  brand: {
    id: string
    name: string
    description?: string | null
    logo_url?: string | null
  }
}>()
</script>

<template>
  <div
    v-if="brand.description"
    class="brand-description text-foreground"
  >
    <div
      class="text-sm md:text-base leading-relaxed"
      v-html="brand.description"
    />
  </div>
</template>

<style>
/* НЕ scoped стили для корректной работы с v-html */

/* Базовые стили для элементов БЕЗ inline-стилей */
.brand-description h1:not([style]) {
  font-size: 2rem;
  font-weight: 700;
  line-height: 1.2;
  margin-top: 2rem;
  margin-bottom: 1rem;
}

.brand-description h2:not([style]) {
  font-size: 1.75rem;
  font-weight: 700;
  line-height: 1.3;
  margin-top: 1.75rem;
  margin-bottom: 1rem;
}

.brand-description h3:not([style]) {
  font-size: 1.5rem;
  font-weight: 600;
  line-height: 1.4;
  margin-top: 1.5rem;
  margin-bottom: 0.75rem;
}

.brand-description h4:not([style]) {
  font-size: 1.25rem;
  font-weight: 600;
  line-height: 1.4;
  margin-top: 1.25rem;
  margin-bottom: 0.75rem;
}

.brand-description p:not([style]) {
  font-size: 1rem;
  line-height: 1.7;
  margin-bottom: 1rem;
}

.brand-description ul:not([style]),
.brand-description ol:not([style]) {
  list-style-position: outside;
  margin-bottom: 1.25rem;
  padding-left: 1.25rem;
}

.brand-description ul:not([style]) {
  list-style-type: disc;
}

.brand-description ol:not([style]) {
  list-style-type: decimal;
}

.brand-description li:not([style]) {
  line-height: 1.7;
  margin-bottom: 0.5rem;
}

.brand-description strong {
  font-weight: 600;
}

.brand-description a {
  color: rgb(var(--color-primary));
  text-decoration: underline;
}

.brand-description a:hover {
  opacity: 0.8;
}
</style>
