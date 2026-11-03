<script setup lang="ts">
import type { PurchasingStatus, StepState } from '@/utils/smartPurchasing'
import { ArrowRight, RefreshCw } from 'lucide-vue-next'
import { purchasingSteps } from '@/utils/smartPurchasing'

definePageMeta({ layout: 'admin' })

/*
 * «Умный закуп» (3.11.2026, владелец: «какая-то неразбериха, собери всё в
 * одном месте касательно умного закупа»). Шаги отбора товаров поставщиков по
 * спросу — по порядку, с состоянием и ссылкой на страницу шага. Сводка —
 * `/api/admin/purchasing`, шаги и тексты — `utils/smartPurchasing.ts`.
 */
const { data, pending, error, refresh }
  = useAsyncData('admin-purchasing', () => adminFetch<PurchasingStatus>('/api/admin/purchasing'), { server: false })

const steps = computed(() => data.value ? purchasingSteps(data.value) : [])

// Номера шагов, которые ждут владельца, — «1, 2 и 5»
const waiting = computed(() => steps.value.flatMap((s, i) => s.state === 'action' ? [i + 1] : []))
const waitingText = computed(() => {
  const n = waiting.value
  return n.length > 1 ? `${n.slice(0, -1).join(', ')} и ${n.at(-1)}` : String(n[0] ?? '')
})

const STATE: Record<StepState, { label: string, badge: string, number: string }> = {
  done: { label: 'Готово', badge: 'bg-green-100 text-green-900 hover:bg-green-100', number: 'bg-green-600 text-white' },
  action: { label: 'Нужно ваше действие', badge: 'bg-amber-100 text-amber-900 hover:bg-amber-100', number: 'bg-amber-500 text-white' },
  running: { label: 'Идёт', badge: 'bg-sky-100 text-sky-900 hover:bg-sky-100', number: 'bg-sky-600 text-white' },
  later: { label: 'В разработке', badge: 'bg-muted text-muted-foreground hover:bg-muted', number: 'bg-muted text-muted-foreground' },
}
</script>

<template>
  <div class="container mx-auto max-w-4xl space-y-6 p-4 md:p-8">
    <div class="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
      <div class="min-w-0">
        <h1 class="text-2xl font-bold tracking-tight md:text-3xl">
          Умный закуп
        </h1>
        <p class="mt-1 text-sm text-muted-foreground">
          Отбираем у поставщиков товары, которые ищут покупатели, и собираем из них заказ. Шаги по порядку — что готово и что ждёт вас.
        </p>
      </div>
      <Button variant="outline" size="sm" :disabled="pending" @click="refresh()">
        <RefreshCw class="mr-2 h-4 w-4" :class="{ 'animate-spin': pending }" />
        Обновить
      </Button>
    </div>

    <ClientOnly>
      <p v-if="error" class="text-sm text-destructive">
        Не удалось загрузить: {{ error.data?.message || error.message }}
      </p>
      <div v-else-if="pending && !data" class="space-y-4">
        <Skeleton v-for="i in 5" :key="i" class="h-32 w-full" />
      </div>
      <template v-else-if="data">
        <p class="text-sm" data-testid="purchasing-waiting">
          <template v-if="waiting.length">
            Сейчас от вас нужно: {{ waiting.length > 1 ? 'шаги' : 'шаг' }} <b>{{ waitingText }}</b>.
          </template>
          <template v-else>
            Сейчас от вас ничего не нужно.
          </template>
        </p>

        <ol class="space-y-4" data-testid="purchasing-steps">
          <li v-for="(step, i) in steps" :key="step.id">
            <Card class="gap-0 py-4 md:py-6" :data-testid="`step-${step.id}`" :data-state="step.state">
              <CardContent class="flex gap-3 px-4 sm:gap-4 md:px-6">
                <span
                  class="flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
                  :class="STATE[step.state].number"
                >
                  {{ i + 1 }}
                </span>
                <div class="min-w-0 flex-1 space-y-2">
                  <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <h2 class="font-semibold leading-tight">
                      {{ step.title }}
                    </h2>
                    <Badge :class="STATE[step.state].badge" data-testid="step-state">
                      {{ STATE[step.state].label }}
                    </Badge>
                  </div>
                  <p class="text-sm text-muted-foreground">
                    {{ step.about }}
                  </p>
                  <p v-if="step.facts.length" class="text-sm" data-testid="step-facts">
                    {{ step.facts.join(' · ') }}
                  </p>
                  <p
                    v-if="step.next"
                    class="text-sm"
                    :class="step.state === 'action' ? 'font-medium' : 'text-muted-foreground'"
                    data-testid="step-next"
                  >
                    {{ step.next }}
                  </p>
                  <Button v-if="step.link" variant="outline" size="sm" as-child>
                    <NuxtLink :to="step.link.to" data-testid="step-link">
                      {{ step.link.label }}
                      <ArrowRight class="ml-1 h-4 w-4" />
                    </NuxtLink>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </li>
        </ol>
      </template>
    </ClientOnly>
  </div>
</template>
