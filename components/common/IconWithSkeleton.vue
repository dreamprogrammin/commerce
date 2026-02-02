<script setup lang="ts">
interface Props {
  name: string
  class?: string
  mode?: 'svg' | 'css'
}

const props = withDefaults(defineProps<Props>(), {
  mode: 'svg',
})
</script>

<template>
  <ClientOnly>
    <Icon
      :name="props.name"
      :class="props.class"
      :mode="props.mode"
    />
    <template #fallback>
      <Skeleton :class="props.class" class="rounded-md" />
    </template>
  </ClientOnly>
</template>
