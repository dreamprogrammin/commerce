<script setup lang="ts">
import type { OfferNarrow } from '@/utils/offerQueries'
import { formatVolume } from '@/utils/marketDemand'

/**
 * Примерный спрос на карточке «Товаров поставщиков» (22.11.2026): как такую
 * вещь ищут, не зная марки, — разбор ИИ (utils/offerGuess.ts) — и ответ
 * DataForSEO по этому запросу.
 */
const props = defineProps<{
  guess: OfferNarrow
  /** Черта сверху — над строкой есть другой спрос */
  ruled: boolean
}>()

// Пробел перед фразой — в строке: пробел в начале шаблона Vue съедает
const phrase = computed(() => ` «${props.guess.phrase ?? props.guess.phrases[0]?.phrase ?? ''}»`)
const volume = computed(() => {
  if (!props.guess.checked)
    return 'спрос ещё не проверен'
  return props.guess.volume > 0 ? `${formatVolume(props.guess.volume)} поисков в месяц` : 'ищут слишком редко — цифр нет'
})
</script>

<template>
  <div class="flex flex-col gap-0.5" :class="{ 'mt-1 border-t border-neutral-200 pt-1.5': ruled }" data-testid="offer-guess">
    <span class="break-words text-muted-foreground">
      Такое ищут как<span class="text-[13px] font-semibold text-foreground" data-testid="offer-guess-phrase">{{ phrase }}</span>
    </span>
    <span class="text-muted-foreground" data-testid="offer-guess-volume">{{ volume }}</span>
  </div>
</template>
