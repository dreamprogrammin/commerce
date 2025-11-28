<script setup lang="ts">
import type { ProgressRootProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import {
  ProgressIndicator,
  ProgressRoot,
} from 'reka-ui'
import { cn } from '@/lib/utils'

const props = withDefaults(
  defineProps<ProgressRootProps & {
    class?: HTMLAttributes['class']
    indicatorClass?: HTMLAttributes['class'] // 🆕 Добавляем prop для класса индикатора
  }>(),
  {
    modelValue: 0,
  },
)

const delegatedProps = reactiveOmit(props, 'class', 'indicatorClass')
</script>

<template>
  <ProgressRoot
    data-slot="progress"
    v-bind="delegatedProps"
    :class="
      cn(
        'bg-primary/20 relative h-2 w-full overflow-hidden rounded-full',
        props.class,
      )
    "
  >
    <ProgressIndicator
      data-slot="progress-indicator"
      :class="cn(
        'bg-primary h-full w-full flex-1 transition-all',
        props.indicatorClass, // 🆕 Применяем кастомный класс
      )"
      :style="`transform: translateX(-${100 - (props.modelValue ?? 0)}%);`"
    >
      <!-- Слот для shimmer-эффекта и другого контента -->
      <slot />
    </ProgressIndicator>
  </ProgressRoot>
</template>
