<script setup lang="ts">
import type { SEOBlock } from '@/utils/parseSEOContent.ts'

const props = defineProps<{
  blocks: SEOBlock[]
}>()

// Дефолтная иконка для li если не задана
const DEFAULT_LI_ICON = 'lucide:check-circle'
</script>

<template>
  <div
    v-if="blocks.length"
    class="bg-white dark:bg-card rounded-xl p-6 lg:p-8 border shadow-sm"
  >
    <div class="space-y-1">
      <template v-for="(block, index) in blocks" :key="index">

        <!-- H2 -->
        <h2
          v-if="block.type === 'h2'"
          class="flex items-center gap-2 text-xl lg:text-2xl font-bold text-foreground mt-6 mb-3 first:mt-0"
        >
          <Icon
            v-if="block.icon"
            :name="block.icon"
            class="w-6 h-6 shrink-0"
            aria-hidden="true"
          />
          {{ block.text }}
        </h2>

        <!-- H3 -->
        <h3
          v-else-if="block.type === 'h3'"
          class="flex items-center gap-2 text-lg lg:text-xl font-semibold text-foreground mt-5 mb-2"
        >
          <Icon
            v-if="block.icon"
            :name="block.icon"
            class="w-5 h-5 shrink-0"
            aria-hidden="true"
          />
          {{ block.text }}
        </h3>

        <!-- P -->
        <p
          v-else-if="block.type === 'p'"
          class="text-sm lg:text-base text-muted-foreground leading-relaxed mb-4"
        >
          {{ block.text }}
        </p>

        <!-- UL -->
        <ul
          v-else-if="block.type === 'ul'"
          class="list-none pl-0 space-y-2 mb-6"
        >
          <li
            v-for="(item, i) in block.items"
            :key="i"
            class="flex items-start gap-3 text-sm lg:text-base text-muted-foreground"
          >
            <Icon
              :name="item.icon ?? DEFAULT_LI_ICON"
              class="w-5 h-5 mt-0.5 shrink-0 text-green-500"
              aria-hidden="true"
            />
            <span>{{ item.text }}</span>
          </li>
        </ul>

      </template>
    </div>
  </div>
</template>