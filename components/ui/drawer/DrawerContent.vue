<script lang="ts" setup>
import type { DialogContentEmits, DialogContentProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { useForwardPropsEmits } from 'reka-ui'
import { DrawerClose, DrawerContent, DrawerPortal } from 'vaul-vue'
import { cn } from '@/lib/utils'
import DrawerOverlay from './DrawerOverlay.vue'

const props = defineProps<DialogContentProps & { class?: HTMLAttributes['class'] }>()
const emits = defineEmits<DialogContentEmits>()

const forwarded = useForwardPropsEmits(props, emits)
</script>

<template>
  <DrawerPortal>
    <DrawerOverlay />
    <DrawerContent
      data-slot="drawer-content"
      v-bind="forwarded"
      :class="cn(
        'group/drawer-content bg-background fixed z-50 flex h-auto flex-col shadow-[0_-10px_40px_-10px_rgba(0,0,0,0.15)] dark:shadow-[0_-10px_40px_-10px_rgba(0,0,0,0.4)]',
        'data-[vaul-drawer-direction=top]:inset-x-0 data-[vaul-drawer-direction=top]:top-0 data-[vaul-drawer-direction=top]:mb-24 data-[vaul-drawer-direction=top]:max-h-[96vh] data-[vaul-drawer-direction=top]:rounded-b-[20px]',
        'data-[vaul-drawer-direction=bottom]:inset-x-0 data-[vaul-drawer-direction=bottom]:bottom-0 data-[vaul-drawer-direction=bottom]:mt-24 data-[vaul-drawer-direction=bottom]:max-h-[96vh] data-[vaul-drawer-direction=bottom]:rounded-t-[20px]',
        'data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:w-3/4 data-[vaul-drawer-direction=right]:sm:max-w-sm',
        'data-[vaul-drawer-direction=left]:inset-y-0 data-[vaul-drawer-direction=left]:left-0 data-[vaul-drawer-direction=left]:w-3/4 data-[vaul-drawer-direction=left]:sm:max-w-sm',
        props.class,
      )"
    >
      <!-- iOS-style header with grabber and close button -->
      <div class="relative shrink-0 hidden group-data-[vaul-drawer-direction=bottom]/drawer-content:block group-data-[vaul-drawer-direction=top]/drawer-content:block">
        <!-- Grabber handle -->
        <div
          class="mx-auto mt-2 mb-1 h-[5px] w-[36px] rounded-full bg-black/20 dark:bg-white/30"
          aria-hidden="true"
        />
        <!-- Close button -->
        <DrawerClose
          class="absolute right-3 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-muted/80 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Закрыть"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 6 6 18" /><path d="m6 6 12 12" />
          </svg>
        </DrawerClose>
      </div>
      <slot />
    </DrawerContent>
  </DrawerPortal>
</template>
