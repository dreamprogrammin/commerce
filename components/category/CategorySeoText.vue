<script setup lang="ts">
const props = defineProps<{
  seoText: string
  isExpanded?: boolean
}>()

const emit = defineEmits<{
  'toggle-expand': []
}>()

const needsExpand = computed(() => {
  const plainText = props.seoText.replace(/<[^>]*>/g, '').trim()
  return plainText.length > 500
})
</script>

<template>
  <div class="bg-white dark:bg-card rounded-xl p-6 lg:p-8 border shadow-sm">
    <div class="category-seo-text">
      <div
        class="text-sm text-muted-foreground transition-all duration-300 overflow-hidden"
        :class="!isExpanded && needsExpand ? 'max-h-[12rem]' : 'max-h-none'"
        :style="!isExpanded && needsExpand ? 'display: -webkit-box; -webkit-line-clamp: 8; -webkit-box-orient: vertical;' : ''"
        v-html="seoText"
      />
    </div>

    <button
      v-if="needsExpand"
      type="button"
      class="text-primary text-sm font-medium hover:underline inline-flex items-center gap-1 mt-4"
      @click="emit('toggle-expand')"
    >
      {{ isExpanded ? 'Свернуть' : 'Читать далее' }}
      <Icon :name="isExpanded ? 'lucide:chevron-up' : 'lucide:chevron-down'" class="w-4 h-4" />
    </button>
  </div>
</template>

<style>
.category-seo-text h2:not([style]) {
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.3;
  margin-top: 1.5rem;
  margin-bottom: 0.75rem;
  color: hsl(var(--foreground));
}

.category-seo-text h3:not([style]) {
  font-size: 1.125rem;
  font-weight: 600;
  line-height: 1.4;
  margin-top: 1.25rem;
  margin-bottom: 0.5rem;
  color: hsl(var(--foreground));
}

.category-seo-text p:not([style]) {
  font-size: 0.875rem;
  line-height: 1.7;
  margin-bottom: 1rem;
  color: hsl(var(--muted-foreground));
}

.category-seo-text ul:not([style]) {
  list-style-position: outside;
  margin-bottom: 1rem;
  padding-left: 1.5rem;
  list-style-type: disc;
}

.category-seo-text li:not([style]) {
  line-height: 1.7;
  margin-bottom: 0.5rem;
  font-size: 0.875rem;
  color: hsl(var(--muted-foreground));
}

.category-seo-text strong {
  font-weight: 600;
}

.category-seo-text a {
  color: hsl(var(--primary));
  text-decoration: underline;
}

.category-seo-text a:hover {
  opacity: 0.8;
}
</style>
