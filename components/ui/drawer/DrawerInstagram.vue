<script setup lang="ts">
const props = withDefaults(defineProps<{
  modelValue: boolean
  drawerHeight?: string
}>(), {
  drawerHeight: '60vh'
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const isOpen = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const contentStyle = computed(() => ({
  height: isOpen.value ? `calc(100vh - ${props.drawerHeight})` : '100vh',
  transition: 'height 0.3s cubic-bezier(0.32, 0.72, 0, 1)'
}))

const drawerStyle = computed(() => ({
  height: props.drawerHeight,
  transform: isOpen.value ? 'translateY(0)' : 'translateY(100%)',
  transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)'
}))

const startY = ref(0)
const currentY = ref(0)
const isDragging = ref(false)

const handleTouchStart = (e: TouchEvent) => {
  startY.value = e.touches[0].clientY
  isDragging.value = true
}

const handleTouchMove = (e: TouchEvent) => {
  if (!isDragging.value) return
  currentY.value = e.touches[0].clientY - startY.value
  if (currentY.value > 0) {
    e.preventDefault()
  }
}

const handleTouchEnd = () => {
  if (currentY.value > 100) {
    isOpen.value = false
  }
  isDragging.value = false
  currentY.value = 0
}
</script>

<template>
  <div class="fixed inset-0 flex flex-col md:hidden">
    <!-- Content area that shrinks -->
    <div :style="contentStyle" class="overflow-hidden">
      <slot name="content" />
    </div>

    <!-- Drawer -->
    <div
      v-if="isOpen"
      :style="drawerStyle"
      class="fixed bottom-0 left-0 right-0 bg-background rounded-t-[20px] shadow-[0_-10px_40px_-10px_rgba(0,0,0,0.15)] dark:shadow-[0_-10px_40px_-10px_rgba(0,0,0,0.4)] flex flex-col"
      @touchstart="handleTouchStart"
      @touchmove="handleTouchMove"
      @touchend="handleTouchEnd"
    >
      <!-- Grabber -->
      <div class="shrink-0 py-2 flex justify-center">
        <div class="h-[5px] w-[36px] rounded-full bg-black/20 dark:bg-white/30" />
      </div>
      
      <!-- Drawer content -->
      <div class="flex-1 overflow-y-auto">
        <slot name="drawer" />
      </div>
    </div>
  </div>
</template>
