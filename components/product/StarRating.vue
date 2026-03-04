<script setup lang="ts">
import { Star, StarHalf } from 'lucide-vue-next'

const props = withDefaults(defineProps<{
  modelValue?: number
  readonly?: boolean
  size?: 'sm' | 'md' | 'lg'
  count?: number
}>(), {
  modelValue: 0,
  readonly: false,
  size: 'md',
  count: 5,
})

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()

const hoverValue = ref(0)

const sizeClass = computed(() => {
  switch (props.size) {
    case 'sm': return 'w-4 h-4'
    case 'lg': return 'w-7 h-7'
    default: return 'w-5 h-5'
  }
})

function setRating(value: number) {
  if (!props.readonly) {
    emit('update:modelValue', value)
  }
}

function setHover(value: number) {
  if (!props.readonly) {
    hoverValue.value = value
  }
}

function getStarState(index: number): 'full' | 'half' | 'empty' {
  const value = hoverValue.value || props.modelValue
  if (index <= Math.floor(value))
    return 'full'
  if (index - 0.5 <= value)
    return 'half'
  return 'empty'
}
</script>

<template>
  <div class="inline-flex items-center gap-0.5" :class="{ 'cursor-pointer': !readonly }">
    <button
      v-for="i in count"
      :key="i"
      type="button"
      :disabled="readonly"
      :class="[sizeClass, readonly ? 'cursor-default' : 'cursor-pointer hover:scale-110 transition-transform']"
      @click="setRating(i)"
      @mouseenter="setHover(i)"
      @mouseleave="setHover(0)"
    >
      <component
        :is="getStarState(i) === 'half' ? StarHalf : Star"
        :class="[
          sizeClass,
          getStarState(i) !== 'empty'
            ? 'fill-yellow-400 text-yellow-400'
            : 'fill-gray-100 text-gray-300',
        ]"
        :stroke-width="1.5"
      />
    </button>
  </div>
</template>
