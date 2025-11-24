<script setup lang="ts">
import type { NavigationMenuContentEmits, NavigationMenuContentProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import {
  NavigationMenuContent,
  useForwardPropsEmits,
} from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<
  NavigationMenuContentProps & { class?: HTMLAttributes['class'] }
>()
const emits = defineEmits<NavigationMenuContentEmits>()

const delegatedProps = reactiveOmit(props, 'class')
const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <NavigationMenuContent
    data-slot="navigation-menu-content"
    v-bind="forwarded"
    :class="
      cn(
        // Базовые позиционирование
        'top-0 left-0 w-full md:absolute md:w-auto',

        // Только fade эффект без zoom и slide
        'data-[motion=from-start]:animate-in data-[motion=from-end]:animate-in',
        'data-[motion=to-start]:animate-out data-[motion=to-end]:animate-out',
        'data-[motion=from-start]:fade-in data-[motion=from-end]:fade-in',
        'data-[motion=to-start]:fade-out data-[motion=to-end]:fade-out',
        'duration-300 ease-out',

        // Стили для viewport=false (только fade)
        'group-data-[viewport=false]/navigation-menu:bg-popover group-data-[viewport=false]/navigation-menu:text-popover-foreground',
        'group-data-[viewport=false]/navigation-menu:data-[state=open]:animate-in',
        'group-data-[viewport=false]/navigation-menu:data-[state=closed]:animate-out',
        'group-data-[viewport=false]/navigation-menu:data-[state=open]:fade-in',
        'group-data-[viewport=false]/navigation-menu:data-[state=closed]:fade-out',

        // Позиционирование и стили контейнера
        'group-data-[viewport=false]/navigation-menu:top-full group-data-[viewport=false]/navigation-menu:mt-1.5',
        'group-data-[viewport=false]/navigation-menu:overflow-hidden group-data-[viewport=false]/navigation-menu:rounded-md',
        'group-data-[viewport=false]/navigation-menu:border group-data-[viewport=false]/navigation-menu:shadow-lg',
        'group-data-[viewport=false]/navigation-menu:duration-300',

        // Стили для ссылок
        '**:data-[slot=navigation-menu-link]:focus:ring-0 **:data-[slot=navigation-menu-link]:focus:outline-none',

        props.class,
      )
    "
  >
    <slot />
  </NavigationMenuContent>
</template>
