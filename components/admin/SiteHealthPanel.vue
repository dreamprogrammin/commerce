<script setup lang="ts">
import type { Component } from 'vue'
import type { Gauge, PaidService, ServiceCurrency, ServiceMeter, ServicePeriod, SiteHealthPage } from '@/utils/siteHealth'
import type { BatteryState } from '@/utils/usageBatteries'
import { CreditCard, Database, ExternalLink, Globe, Pencil, Plus, Search, Server, Sparkles, Trash2 } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { monthlyTotal, priceLine, renewLine, siteBattery } from '@/utils/siteHealth'

/*
 * «Состояние сайта» и платные сервисы (21 ноября 2026). Владелец после паузы
 * Vercel: «в админку нужно завести батарейку состояния сайта и все сервисы
 * платные которые имеются». Сайт проверяет сторож каждые 5 минут (эдж-функция
 * site-watchdog), он же пишет в Telegram; сервисы с ценой и датой продления
 * правит владелец здесь, бот напоминает о продлении за неделю.
 */

const errorText = (e: any, fallback: string) => e?.data?.message || e?.statusMessage || fallback
const { data, error, refresh } = useAsyncData('admin-site-health', () => adminFetch<SiteHealthPage>('/api/admin/site-health'), { server: false })

const TILE: Record<BatteryState, string> = { ok: 'bg-green-100 text-green-700', low: 'bg-amber-100 text-amber-700', empty: 'bg-red-600/10 text-red-700', off: 'bg-neutral-100 text-neutral-500' }
const BAR: Record<BatteryState, string> = { ok: 'bg-primary', low: 'bg-amber-500', empty: 'bg-red-500', off: 'bg-muted-foreground/30' }
const CHIP = 'inline-flex items-center whitespace-nowrap rounded-full px-2 py-[3px] text-xs font-semibold'
const STATUS: Record<BatteryState, string> = { ok: 'В норме', low: 'Внимание', empty: 'Сбой', off: 'Нет данных' }
const METER_ICON: Record<ServiceMeter, Component> = { vercel: Server, supabase: Database, dataforseo: Search, ai: Sparkles }

const site = computed(() => siteBattery(data.value?.site ?? null))
const total = computed(() => monthlyTotal(data.value?.services ?? []))
const reading = (s: PaidService): Gauge | null => (s.meter ? data.value?.readings[s.meter] ?? null : null)

function when(iso: string) {
  return new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Almaty', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

// --- правка сервиса ---
const editing = ref<string | 'new' | null>(null)
const form = reactive({ name: '', plan: '', cost: '', currency: 'USD' as ServiceCurrency, period: 'month' as ServicePeriod, renewsOn: '', url: '', note: '' })
const saving = ref(false)
const confirmDelete = ref<string | null>(null)

function edit(s: PaidService | null) {
  Object.assign(form, s
    ? { name: s.name, plan: s.plan, cost: s.cost == null ? '' : String(s.cost).replace('.', ','), currency: s.currency, period: s.period, renewsOn: s.renewsOn ?? '', url: s.url ?? '', note: s.note }
    : { name: '', plan: '', cost: '', currency: 'USD', period: 'month', renewsOn: '', url: '', note: '' })
  editing.value = s ? s.id : 'new'
}

async function save() {
  if (saving.value)
    return
  saving.value = true
  try {
    await adminFetch('/api/admin/paid-services', { method: 'POST', body: { ...form, id: editing.value === 'new' ? undefined : editing.value } })
    toast.success('Сервис сохранён')
    editing.value = null
    await refresh()
  }
  catch (e) {
    toast.error(errorText(e, 'Не удалось сохранить'))
  }
  finally {
    saving.value = false
  }
}

async function remove(s: PaidService) {
  if (confirmDelete.value !== s.id) {
    confirmDelete.value = s.id
    return
  }
  confirmDelete.value = null
  try {
    await adminFetch(`/api/admin/paid-services/${s.id}`, { method: 'DELETE' })
    editing.value = null
    await refresh()
  }
  catch (e) {
    toast.error(errorText(e, 'Не удалось удалить'))
  }
}
</script>

<template>
  <ClientOnly>
    <p v-if="error" class="text-sm text-destructive">
      Состояние сайта: {{ errorText(error, 'не удалось загрузить') }}
    </p>
    <div v-else-if="data && !data.installed" class="rounded-md bg-amber-50 p-3 text-sm text-amber-900" data-testid="site-health-not-installed">
      Состояние сайта и платные сервисы появятся после миграции 20261121120000 (CI «Миграции Supabase», APPLY).
    </div>
    <div v-else-if="data" class="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <!-- Сайт -->
      <Card data-testid="site-health" :data-state="site.state">
        <CardHeader class="pb-3">
          <CardTitle class="text-base">
            Состояние сайта
          </CardTitle>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="flex items-start gap-3">
            <span class="flex size-11 shrink-0 items-center justify-center rounded-xl" :class="TILE[site.state]">
              <Globe class="size-5" />
            </span>
            <div class="flex min-w-0 flex-1 flex-col gap-1.5">
              <div class="flex items-center justify-between gap-2">
                <span class="font-semibold" data-testid="site-health-headline">{{ site.headline }}</span>
                <span :class="[CHIP, TILE[site.state]]">{{ STATUS[site.state] }}</span>
              </div>
              <span class="text-sm">
                <span class="font-medium">uhti.kz</span> — <span data-testid="site-health-value">{{ site.value }}</span>
              </span>
              <div
                v-if="site.level != null"
                class="h-2 w-full overflow-hidden rounded-full bg-primary/15"
                role="meter"
                aria-label="Доступность за 24 часа"
                aria-valuemin="0"
                aria-valuemax="100"
                :aria-valuenow="Math.round(site.level * 100)"
              >
                <div class="h-full rounded-full" :class="BAR[site.state]" :style="{ width: `${Math.max(site.level > 0 ? 3 : 0, Math.round(site.level * 100))}%` }" />
              </div>
              <p class="text-xs text-muted-foreground" data-testid="site-health-note">
                {{ site.note }}
              </p>
            </div>
          </div>
          <div v-if="data.site?.incidents.length" class="space-y-1 border-t pt-3" data-testid="site-health-incidents">
            <p class="text-xs font-medium text-muted-foreground">
              Последние сбои
            </p>
            <p v-for="i in data.site.incidents" :key="i.startedAt" class="text-xs">
              <span class="tabular-nums">{{ when(i.startedAt) }}{{ i.endedAt ? ` — ${when(i.endedAt)}` : ' — сейчас' }}</span>
              <span class="text-muted-foreground"> · {{ i.reason }}</span>
            </p>
          </div>
          <p class="text-xs text-muted-foreground">
            Проверка каждые 5 минут. Не открылся два раза подряд — бот пишет владельцу в Telegram, открылся — пишет снова.
          </p>
        </CardContent>
      </Card>

      <!-- Платные сервисы -->
      <Card data-testid="paid-services">
        <CardHeader class="pb-3">
          <div class="flex items-center justify-between gap-2">
            <CardTitle class="text-base">
              Платные сервисы
            </CardTitle>
            <Button v-if="editing !== 'new'" size="sm" variant="outline" data-testid="paid-add" @click="edit(null)">
              <Plus class="mr-1 size-4" /> Добавить
            </Button>
          </div>
          <CardDescription data-testid="paid-total">
            В месяц: <span class="font-medium text-foreground">{{ total.sums.length ? total.sums.join(' + ') : '0' }}</span><template v-if="total.usage.length">
              + по факту ({{ total.usage.join(', ') }})
            </template><template v-if="total.unknown.length">
              · без цены: {{ total.unknown.join(', ') }}
            </template>
          </CardDescription>
        </CardHeader>
        <CardContent class="space-y-1">
          <template v-for="s in [...data.services, ...(editing === 'new' ? [null] : [])]" :key="s?.id ?? 'new'">
            <!-- форма -->
            <form v-if="(s && editing === s.id) || (!s && editing === 'new')" class="grid grid-cols-2 gap-2 rounded-lg border p-3" data-testid="paid-form" @submit.prevent="save">
              <label class="col-span-2 text-xs">Название
                <Input v-model="form.name" class="mt-1 h-8" required maxlength="80" data-testid="paid-name" />
              </label>
              <label class="text-xs">Тариф
                <Input v-model="form.plan" class="mt-1 h-8" maxlength="80" placeholder="Pro" data-testid="paid-plan" />
              </label>
              <label class="text-xs">Период
                <select v-model="form.period" class="mt-1 h-8 w-full rounded-md border bg-background px-2 text-sm" data-testid="paid-period">
                  <option value="month">в месяц</option>
                  <option value="year">в год</option>
                  <option value="usage">по факту</option>
                </select>
              </label>
              <label class="text-xs">Цена
                <Input v-model="form.cost" class="mt-1 h-8" inputmode="decimal" placeholder="20" data-testid="paid-cost" />
              </label>
              <label class="text-xs">Валюта
                <select v-model="form.currency" class="mt-1 h-8 w-full rounded-md border bg-background px-2 text-sm" data-testid="paid-currency">
                  <option value="USD">$</option>
                  <option value="KZT">₸</option>
                  <option value="EUR">€</option>
                  <option value="RUB">₽</option>
                </select>
              </label>
              <label class="text-xs">Продление
                <Input v-model="form.renewsOn" type="date" class="mt-1 h-8" data-testid="paid-renews" />
              </label>
              <label class="text-xs">Ссылка
                <Input v-model="form.url" class="mt-1 h-8" placeholder="https://" data-testid="paid-url" />
              </label>
              <label class="col-span-2 text-xs">Заметка
                <Input v-model="form.note" class="mt-1 h-8" maxlength="500" data-testid="paid-note" />
              </label>
              <div class="col-span-2 flex flex-wrap gap-2 pt-1">
                <Button type="submit" size="sm" :disabled="saving" data-testid="paid-save">
                  Сохранить
                </Button>
                <Button type="button" size="sm" variant="ghost" @click="editing = null">
                  Отмена
                </Button>
                <Button v-if="s" type="button" size="sm" variant="ghost" class="ml-auto text-destructive" data-testid="paid-delete" @click="remove(s)">
                  <Trash2 class="mr-1 size-4" /> {{ confirmDelete === s.id ? 'Точно удалить?' : 'Удалить' }}
                </Button>
              </div>
            </form>

            <!-- строка -->
            <div v-else-if="s" class="flex items-start gap-3 rounded-lg px-1 py-2" data-testid="paid-row" :data-name="s.name">
              <span class="flex size-9 shrink-0 items-center justify-center rounded-xl" :class="TILE[reading(s)?.state ?? 'off']">
                <component :is="s.meter ? METER_ICON[s.meter] : CreditCard" class="size-[18px]" />
              </span>
              <div class="flex min-w-0 flex-1 flex-col gap-1">
                <div class="flex items-center justify-between gap-2">
                  <span class="text-sm font-medium">
                    {{ s.name }}<span v-if="s.plan" class="font-normal text-muted-foreground"> · {{ s.plan }}</span>
                  </span>
                  <span class="flex shrink-0 items-center gap-1">
                    <a v-if="s.url" :href="s.url" target="_blank" rel="noopener" class="rounded p-1 text-muted-foreground hover:text-foreground" :aria-label="`Открыть ${s.name}`">
                      <ExternalLink class="size-4" />
                    </a>
                    <button type="button" class="rounded p-1 text-muted-foreground hover:text-foreground" :aria-label="`Изменить ${s.name}`" data-testid="paid-edit" @click="edit(s)">
                      <Pencil class="size-4" />
                    </button>
                  </span>
                </div>
                <span class="text-[13px] text-muted-foreground">
                  <span class="font-medium text-foreground tabular-nums" data-testid="paid-price">{{ priceLine(s) }}</span><template v-if="renewLine(s.renewsOn)">
                    · <span :class="renewLine(s.renewsOn)!.soon ? 'font-medium text-amber-700' : ''" data-testid="paid-renew">{{ renewLine(s.renewsOn)!.text }}</span>
                  </template>
                </span>
                <template v-if="reading(s)">
                  <span class="text-xs" data-testid="paid-reading">{{ reading(s)!.value }}</span>
                  <div v-if="reading(s)!.level != null" class="h-1.5 w-full overflow-hidden rounded-full bg-primary/15">
                    <div class="h-full rounded-full" :class="BAR[reading(s)!.state]" :style="{ width: `${Math.max(reading(s)!.level! > 0 ? 3 : 0, Math.round(reading(s)!.level! * 100))}%` }" />
                  </div>
                  <span v-if="reading(s)!.note" class="text-xs text-muted-foreground">{{ reading(s)!.note }}</span>
                </template>
                <span v-else-if="s.note" class="text-xs text-muted-foreground">{{ s.note }}</span>
              </div>
            </div>
          </template>
          <p class="pt-2 text-xs text-muted-foreground">
            Счета Vercel и трафик Supabase сайт сам не видит — их смотрите по ссылкам. За неделю до даты продления бот напомнит в Telegram.
          </p>
        </CardContent>
      </Card>
    </div>
  </ClientOnly>
</template>
