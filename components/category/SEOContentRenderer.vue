<script setup lang="ts">
interface SEOBlock {
  type: 'h2' | 'h3' | 'p' | 'ul'
  text?: string
  icon?: string
  items?: string[]
}

defineProps<{
  blocks: SEOBlock[]
  isExpanded?: boolean
}>()

const emit = defineEmits<{
  'toggle-expand': []
}>()

const needsExpand = computed(() => {
  // Считаем общую длину текста
  return false // Пока без сворачивания
})
</script>

<template>
  <div class="bg-white dark:bg-card rounded-xl p-6 lg:p-8 border shadow-sm">
    <div class="prose max-w-none">
      <div v-for="(block, index) in blocks" :key="index">
        <!-- Заголовки H2 -->
        <h2 v-if="block.type === 'h2'" class="text-xl lg:text-2xl font-bold mt-6 first:mt-0 mb-4 flex items-center gap-2">
          <Icon v-if="block.icon" :name="block.icon" class="w-6 h-6 shrink-0" />
          <span>{{ block.text }}</span>
        </h2>

        <!-- Заголовки H3 -->
        <h3 v-if="block.type === 'h3'" class="text-lg lg:text-xl font-semibold mt-5 mb-3 flex items-center gap-2">
          <Icon v-if="block.icon" :name="block.icon" class="w-5 h-5 shrink-0" />
          <span>{{ block.text }}</span>
        </h3>

        <!-- Параграфы -->
        <p v-if="block.type === 'p'" class="mb-4 text-sm lg:text-base text-muted-foreground leading-relaxed">
          {{ block.text }}
        </p>

        <!-- Списки -->
        <ul v-if="block.type === 'ul'" class="space-y-2 mb-6 pl-0 list-none">
          <li v-for="(item, i) in block.items" :key="i" class="flex gap-3 text-sm lg:text-base">
            <Icon name="lucide:check-circle" class="text-green-500 shrink-0 w-5 h-5 mt-0.5" />
            <span class="text-muted-foreground">{{ item }}</span>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
