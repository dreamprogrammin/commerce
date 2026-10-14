<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useAdminRevalidateStore } from '@/stores/adminStore/adminRevalidateStore'

/**
 * Виджет очереди обновления сайта: сколько правок ждёт, через сколько уйдут,
 * кнопка «Обновить сейчас» и итог последней отправки. Сама очередь и таймер —
 * в adminRevalidateStore; виджет только показывает.
 *
 * Справа внизу живут уведомления vue-sonner (на телефоне — снизу во всю
 * ширину), и «Товар обновлён» закрывало таймер. Поэтому на компьютере виджет
 * слева внизу, за боковым меню (`md:left-[17rem]` — меню `w-64`), а на
 * телефоне — сверху, под шапкой админки (`top-16`, шапка `h-14`).
 */
const queue = useAdminRevalidateStore()
const { changes, deadline, flushing, lastResult } = storeToRefs(queue)

const now = ref(Date.now())
let tick: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  tick = setInterval(() => (now.value = Date.now()), 1000)
})
onBeforeUnmount(() => {
  if (tick)
    clearInterval(tick)
})

const RESULT_SHOWN_MS = 15_000

const secondsLeft = computed(() =>
  deadline.value ? Math.max(0, Math.ceil((deadline.value - now.value) / 1000)) : 0,
)
const countdown = computed(() => {
  const s = secondsLeft.value
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
})
const showResult = computed(() =>
  !deadline.value && !flushing.value && !!lastResult.value && now.value - lastResult.value.at < RESULT_SHOWN_MS,
)
const visible = computed(() => !!deadline.value || flushing.value || showResult.value)

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11)
    return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14))
    return few
  return many
}

const resultText = computed(() => {
  const r = lastResult.value
  if (!r)
    return ''
  if (r.error)
    return `Не удалось обновить сайт (${r.error}). Страницы обновятся сами в течение суток.`
  if (r.skipped)
    return `Обновлять нечего: ${r.skipped}.`
  const pages = `${r.revalidated} ${plural(r.revalidated, 'страница', 'страницы', 'страниц')}`
  return r.failed
    ? `Сайт обновлён: ${pages}, не удалось — ${r.failed}.`
    : `Сайт обновлён: ${pages}.`
})
</script>

<template>
  <div
    v-if="visible"
    role="status"
    aria-live="polite"
    class="fixed left-4 right-4 top-16 z-50 flex items-center gap-3 rounded-xl border bg-background px-4 py-3 text-sm shadow-lg md:bottom-4 md:right-auto md:left-[17rem] md:top-auto"
  >
    <template v-if="flushing">
      <Icon name="lucide:loader-circle" class="size-4 shrink-0 animate-spin text-primary" />
      <span>Обновляем страницы сайта…</span>
    </template>

    <template v-else-if="deadline">
      <Icon name="lucide:timer" class="size-4 shrink-0 text-primary" />
      <span>
        Сайт обновится через <b class="tabular-nums">{{ countdown }}</b>
        <span class="text-muted-foreground">
          · {{ changes }} {{ plural(changes, 'изменение', 'изменения', 'изменений') }}
        </span>
      </span>
      <Button size="sm" variant="outline" class="ml-auto shrink-0" @click="queue.flushNow()">
        <span class="sm:hidden">Сейчас</span>
        <span class="hidden sm:inline">Обновить сейчас</span>
      </Button>
    </template>

    <template v-else-if="showResult">
      <Icon
        :name="lastResult?.error || lastResult?.failed ? 'lucide:circle-alert' : 'lucide:circle-check'"
        class="size-4 shrink-0"
        :class="lastResult?.error || lastResult?.failed ? 'text-destructive' : 'text-success'"
      />
      <span>{{ resultText }}</span>
    </template>
  </div>
</template>
