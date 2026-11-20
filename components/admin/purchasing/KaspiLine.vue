<script setup lang="ts">
import type { KaspiSummary } from '@/utils/kaspiSnapshot'
import { kaspiLineParts } from '@/utils/kaspiSnapshot'

/**
 * Строка «Kaspi» у темы спроса и товара поставщика (20.11.2026): последний
 * замер и прирост отзывов; ссылка ведёт на страницу «Kaspi» с этой целью.
 */
const props = defineProps<{ summary: KaspiSummary | null | undefined, to: string }>()

const parts = computed(() => (props.summary ? kaspiLineParts(props.summary) : []))
const when = computed(() => props.summary
  ? new Date(props.summary.last.takenAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
  : '')
</script>

<template>
  <NuxtLink
    :to="to"
    data-testid="kaspi-line"
    class="inline-flex max-w-full flex-wrap items-baseline gap-x-1.5 text-xs text-muted-foreground hover:text-foreground"
  >
    <span class="font-medium text-foreground">Kaspi</span>
    <template v-if="parts.length">
      <span v-for="p in parts" :key="p" class="whitespace-nowrap before:mr-1.5 before:content-['·']">{{ p }}</span>
      <span class="whitespace-nowrap before:mr-1.5 before:content-['·']">{{ when }}</span>
    </template>
    <span v-else class="underline underline-offset-2">добавить цифры</span>
  </NuxtLink>
</template>
