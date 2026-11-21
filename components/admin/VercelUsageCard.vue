<script setup lang="ts">
import type { VercelPanel } from '@/utils/siteHealth'
import { AlertTriangle, ExternalLink, Lightbulb } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { SERVICE_RU, usdText } from '@/utils/vercelUsage'

/*
 * Vercel на дашборде (21 ноября 2026). Владелец: «а ты можешь взять и в
 * версел данные и показывать в админке и давать подсказки туда». Расход за
 * месяц по услугам, прогноз, последние сборки и подсказки — что дорого и что
 * сломалось. Ключ задаёт владелец здесь; он лежит в Vault и наружу не уходит.
 */
const props = defineProps<{ vercel: VercelPanel }>()
const emit = defineEmits<{ changed: [] }>()

const errorText = (e: any, fallback: string) => e?.data?.message || e?.statusMessage || fallback
const token = ref('')
const saving = ref(false)
const changing = ref(false)
const confirmDelete = ref(false)

const u = computed(() => props.vercel.usage)
// Услуги с расходом; тариф — отдельно, мелочь меньше цента не показываем
const rows = computed(() => (u.value?.services ?? []).filter(s => s.name !== 'Pro' && s.effective >= 0.005).slice(0, 8))

function qty(n: number, unit: string) {
  const v = n >= 100 ? Math.round(n).toLocaleString('ru-RU') : (Math.round(n * 100) / 100).toLocaleString('ru-RU')
  const UNIT: Record<string, string> = { 'minute': 'мин', 'hour': 'ч', 'gigabyte': 'ГБ', 'gigabyte-hour': 'ГБ·ч', 'Writes': '', 'Reads': '', 'Requests': '', 'Invocations': '', 'Events': '' }
  const tail = UNIT[unit] ?? unit
  return tail ? [v, tail].join('\u00A0') : v
}

function when(iso: string) {
  return new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Almaty', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}
const STATE: Record<string, { text: string, cls: string }> = {
  READY: { text: 'собрано', cls: 'text-green-700' },
  ERROR: { text: 'упало', cls: 'text-red-700 font-medium' },
  BUILDING: { text: 'собирается', cls: 'text-amber-700' },
  QUEUED: { text: 'в очереди', cls: 'text-amber-700' },
  INITIALIZING: { text: 'собирается', cls: 'text-amber-700' },
  CANCELED: { text: 'отменено', cls: 'text-muted-foreground' },
}

async function saveKey() {
  if (saving.value || !token.value.trim())
    return
  saving.value = true
  try {
    const r = await adminFetch<{ last4: string, teamName: string }>('/api/admin/vercel/key', { method: 'POST', body: { token: token.value } })
    token.value = ''
    changing.value = false
    toast.success(`Ключ принят: команда ${r.teamName}`)
    emit('changed')
  }
  catch (e) {
    toast.error(errorText(e, 'Ключ не сохранён'))
  }
  finally {
    saving.value = false
  }
}

async function removeKey() {
  if (!confirmDelete.value) {
    confirmDelete.value = true
    return
  }
  confirmDelete.value = false
  try {
    await adminFetch('/api/admin/vercel/key', { method: 'DELETE' })
    emit('changed')
  }
  catch (e) {
    toast.error(errorText(e, 'Не удалось убрать ключ'))
  }
}
</script>

<template>
  <Card data-testid="vercel" class="lg:col-span-2">
    <CardHeader class="pb-3">
      <div class="flex items-center justify-between gap-2">
        <CardTitle class="text-base">
          Vercel — расход и сборки
        </CardTitle>
        <a href="https://vercel.com/dashboard" target="_blank" rel="noopener" class="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          Панель Vercel <ExternalLink class="size-3.5" />
        </a>
      </div>
      <CardDescription v-if="u" data-testid="vercel-total">
        Потреблено с {{ new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone: 'America/Los_Angeles' }).format(new Date(u.periodStart)) }}: <span class="font-medium text-foreground">{{ usdText(u.effective) }}</span> (подписка и услуги)<template v-if="u.forecast != null">
          · услуги к концу месяца ≈ <span class="font-medium text-foreground">{{ usdText(u.forecast) }}</span>
        </template>
        · сверх включённого в Pro: <span :class="u.billed >= 0.01 ? 'font-medium text-red-700' : 'font-medium text-foreground'">{{ usdText(u.billed) }}</span>
      </CardDescription>
    </CardHeader>
    <CardContent class="space-y-4">
      <p v-if="!vercel.installed" class="rounded-md bg-amber-50 p-3 text-sm text-amber-900" data-testid="vercel-not-installed">
        Появится после миграции 20261121140000 (CI «Миграции Supabase», APPLY).
      </p>

      <!-- Ключ -->
      <template v-else-if="!vercel.key || changing">
        <div class="space-y-2 text-sm" data-testid="vercel-key-form">
          <p>Чтобы сайт видел расход Vercel, нужен ключ — его создаёте вы, у сайта он только на чтение расхода и сборок:</p>
          <ol class="list-decimal space-y-1 pl-5 text-[13px] text-muted-foreground">
            <li>Откройте <a href="https://vercel.com/account/settings/tokens" target="_blank" rel="noopener" class="text-primary underline">vercel.com → Account Settings → Tokens</a>.</li>
            <li>Create Token: имя «uhti-admin», Scope — команда, где лежит сайт, срок — No Expiration или год.</li>
            <li>Скопируйте ключ и вставьте сюда. Сайт проверит его у Vercel и сохранит в зашифрованное хранилище.</li>
          </ol>
          <form class="flex flex-wrap gap-2" @submit.prevent="saveKey">
            <Input v-model="token" type="password" autocomplete="off" class="h-9 min-w-0 flex-1" placeholder="Ключ Vercel" data-testid="vercel-token" />
            <Button type="submit" size="sm" class="h-9" :disabled="saving || !token.trim()" data-testid="vercel-save">
              {{ saving ? 'Проверяю…' : 'Сохранить' }}
            </Button>
            <Button v-if="changing" type="button" size="sm" variant="ghost" class="h-9" @click="changing = false">
              Отмена
            </Button>
          </form>
        </div>
      </template>

      <template v-else>
        <p v-if="vercel.error" class="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-900" data-testid="vercel-error">
          <AlertTriangle class="mt-0.5 size-4 shrink-0" /> {{ vercel.error }}
        </p>

        <!-- Подсказки -->
        <div v-if="vercel.hints.length" class="space-y-2" data-testid="vercel-hints">
          <p
            v-for="h in vercel.hints"
            :key="h.text"
            class="flex items-start gap-2 rounded-md p-3 text-sm"
            :class="h.level === 'warn' ? 'bg-red-600/10 text-red-800' : 'bg-primary/10 text-foreground'"
            data-testid="vercel-hint"
            :data-level="h.level"
          >
            <component :is="h.level === 'warn' ? AlertTriangle : Lightbulb" class="mt-0.5 size-4 shrink-0" />
            <span>{{ h.text }}</span>
          </p>
        </div>
        <p v-else-if="u" class="text-sm text-muted-foreground" data-testid="vercel-no-hints">
          Подсказок нет: расход в пределах тарифа, сборки собираются.
        </p>

        <div v-if="u" class="grid grid-cols-1 gap-6 md:grid-cols-2">
          <!-- Услуги -->
          <div>
            <p class="mb-1 text-xs font-medium text-muted-foreground">
              На что ушло в этом месяце
            </p>
            <table class="w-full text-sm" data-testid="vercel-services">
              <tbody>
                <tr v-for="s in rows" :key="s.name" class="border-b last:border-0" data-testid="vercel-service" :data-name="s.name">
                  <td class="py-1.5 pr-2">
                    {{ SERVICE_RU[s.name] ?? s.name }}
                  </td>
                  <td class="whitespace-nowrap py-1.5 pr-2 text-right text-xs text-muted-foreground tabular-nums">
                    {{ qty(s.quantity, s.unit) }}
                  </td>
                  <td class="whitespace-nowrap py-1.5 text-right font-medium tabular-nums">
                    {{ usdText(s.effective) }}
                  </td>
                </tr>
                <tr v-if="!rows.length">
                  <td class="py-1.5 text-muted-foreground">
                    Расхода пока нет
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <!-- Сборки -->
          <div>
            <p class="mb-1 text-xs font-medium text-muted-foreground">
              Последние сборки
            </p>
            <ul class="space-y-1.5 text-sm" data-testid="vercel-deploys">
              <li v-for="d in u.deploys" :key="d.createdAt + d.target" class="flex flex-col" data-testid="vercel-deploy" :data-state="d.state">
                <span>
                  <span class="font-medium">{{ d.target === 'production' ? 'uhti.kz' : `превью${d.branch ? ` · ${d.branch}` : ''}` }}</span>
                  — <span :class="STATE[d.state]?.cls ?? ''">{{ STATE[d.state]?.text ?? d.state.toLowerCase() }}</span>
                  <span class="text-xs text-muted-foreground tabular-nums"> · {{ when(d.createdAt) }}</span>
                </span>
                <span v-if="d.message" class="truncate text-xs text-muted-foreground">{{ d.message }}</span>
              </li>
              <li v-if="!u.deploys.length" class="text-muted-foreground">
                Сборок не видно
              </li>
            </ul>
          </div>
        </div>

        <p class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span data-testid="vercel-key">Ключ …{{ vercel.key.last4 }}<template v-if="vercel.key.teamName">, команда {{ vercel.key.teamName }}</template></span>
          <button type="button" class="underline hover:text-foreground" data-testid="vercel-change" @click="changing = true">
            Заменить
          </button>
          <button type="button" class="text-destructive underline" data-testid="vercel-delete" @click="removeKey">
            {{ confirmDelete ? 'Точно убрать?' : 'Убрать' }}
          </button>
          <span>Данные обновляются раз в 10 минут.</span>
        </p>
      </template>
    </CardContent>
  </Card>
</template>
