<script setup lang="ts">
import type { BatteryState } from '@/utils/usageBatteries'
import { ChevronDown } from 'lucide-vue-next'
import { useSiteHealth } from '@/composables/admin/useSiteHealth'
import { siteHealthLine } from '@/utils/siteHealth'

/*
 * Строка над продажами (21.11.2026, владелец: «дашборд какой-то неудобный,
 * я жду когда он прогрузится»). Раньше карточки сайта и сервисов стояли над
 * продажами, появлялись последними и сдвигали их вниз — на телефоне на
 * несколько экранов. Теперь наверху одна строка: работает ли сайт и что
 * требует внимания; карточки — внизу страницы. Место под строку занято
 * заранее, чтобы продажи не съезжали, когда она догрузится.
 */

const { data, error } = useSiteHealth()
const line = computed(() => (data.value?.installed ? siteHealthLine(data.value) : null))

const DOT: Record<BatteryState, string> = { ok: 'bg-green-500', low: 'bg-amber-500', empty: 'bg-red-500', off: 'bg-neutral-400' }
const ALERT = { warn: 'bg-amber-100 text-amber-800', bad: 'bg-red-600/10 text-red-700' }
const CHIP = 'inline-flex items-center rounded-full px-2 py-[3px] text-xs font-semibold'
</script>

<template>
  <div
    class="flex min-h-[46px] flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border bg-card px-4 py-2.5 text-sm"
    data-testid="site-health-strip"
    :data-state="line?.state ?? (error ? 'error' : 'loading')"
  >
    <template v-if="line">
      <span class="flex items-center gap-2">
        <span class="size-2.5 shrink-0 rounded-full" :class="DOT[line.state]" />
        <span class="font-semibold" data-testid="strip-headline">{{ line.headline }}</span>
      </span>
      <span v-if="line.facts.length" class="text-muted-foreground tabular-nums" data-testid="strip-facts">{{ line.facts.join(' · ') }}</span>
      <span v-for="a in line.alerts" :key="a.text" :class="[CHIP, ALERT[a.level]]" data-testid="strip-alert" :data-level="a.level">{{ a.text }}</span>
    </template>
    <span v-else-if="error" class="text-destructive">Состояние сайта не загрузилось</span>
    <span v-else-if="data" class="text-muted-foreground">Состояние сайта появится после миграции 20261121120000</span>
    <span v-else class="flex items-center gap-2" aria-hidden="true">
      <Skeleton class="size-2.5 rounded-full" />
      <Skeleton class="h-4 w-56 max-w-[60vw]" />
    </span>
    <a href="#site-health-details" class="ml-auto inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-primary hover:underline" data-testid="strip-more">
      Сайт и сервисы
      <ChevronDown class="size-3.5" />
    </a>
  </div>
</template>
