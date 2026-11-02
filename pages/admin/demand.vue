<script setup lang="ts">
import type { DemandCandidate, DemandFilter, DemandSource, DemandTopic, YandexProgress } from '@/utils/marketDemand'
import { ExternalLink, KeyRound, Pencil, Plus, RefreshCw, Search, Sparkles, TrendingUp } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import {
  dataUntilLabel,
  DEMAND_FILTERS,
  DEMAND_REFRESH_COST,
  demandStats,
  formatKztCost,
  formatUsd,
  formatVolume,
  matchesDemandFilter,
  monthLabel,
  parseDemandList,
  peakLabel,
  phrasesDative,
  sortDemandTopics,
  sparkPoints,
  topicNameFromKeyword,
  trendKind,
  trendLabel,
  YANDEX_PHRASE_COST_KZT,
} from '@/utils/marketDemand'

/*
 * «Спрос на рынке» (1 ноября 2026). Владелец: «нужно искать, что в рынке
 * актуально, чтобы мы отбирали товар от поставщиков в тг тот товар, который
 * нужен». Что ищут в Google в Казахстане — по темам товаров (DataForSEO,
 * Google Ads): спрос, тренд к прошлому году, пик сезона, есть ли у нас. Ниже —
 * новые запросы на рынке, которых в темах ещё нет.
 *
 * Обновление платное (≈ $0,18 с баланса DataForSEO): само — 5-го числа, по
 * кнопке — с подтверждением. Запрос уходит из базы (pg_net), ответ страница
 * забирает, опрашивая сервер, пока он не придёт.
 *
 * Яндекс (2 ноября 2026, «еще подключаем туда яндекс»): Вордстат через Yandex
 * Cloud, 0,1 ₸ за тему. Числа — рядом, переключателем «Google | Яндекс»: они
 * считаются по-разному и не складываются. Запросы уходят из базы понемногу
 * (квота Вордстата — 100 в час), страница только смотрит, как идёт.
 */
definePageMeta({ layout: 'admin' })

interface Run {
  id: number
  kind: 'volumes' | 'ideas'
  status: 'pending' | 'done' | 'failed'
  scheduled: boolean
  keywords_sent: number
  items: number | null
  cost: number | null
  error: string | null
  requested_at: string
  finished_at: string | null
}
interface Credentials {
  login: string
  last4: string
  updatedAt: string
  balance: number | null
  balanceError: string | null
}
interface YandexKey {
  folderId: string
  last4: string
  region: string
  updatedAt: string
}
/** null — миграция Вордстата ещё не применена */
type YandexData = { key: YandexKey | null, progress: YandexProgress } | null
type DemandData
  = | { installed: false }
    | {
      installed: true
      topics: DemandTopic[]
      candidates: DemandCandidate[]
      runs: Run[]
      pending: boolean
      collectError: string | null
      credentials: Credentials | null
      yandex?: YandexData
    }

const { data, pending, error, refresh }
  = useAsyncData('admin-demand', () => adminFetch<DemandData>('/api/admin/demand'), { server: false })

const ready = computed(() => (data.value?.installed ? data.value : null))
const errorText = (e: any, fallback: string) => e?.data?.message || e?.statusMessage || fallback
function date(iso: string | null) {
  return iso
    ? new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : ''
}
function time(iso: string) {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

// --- Ключ DataForSEO ---
const keyForm = reactive({ open: false, login: '', password: '', saving: false })
const confirmDeleteKey = ref(false)

async function saveKey() {
  if (keyForm.saving || !keyForm.login.trim() || !keyForm.password.trim())
    return
  keyForm.saving = true
  try {
    const res = await adminFetch<{ login: string, last4: string, balance: number | null }>('/api/admin/demand/credentials', {
      method: 'POST',
      body: { login: keyForm.login, password: keyForm.password },
    })
    toast.success(`Ключ DataForSEO проверен и сохранён${res.balance != null ? ` · баланс ${formatUsd(res.balance)}` : ''}`)
    Object.assign(keyForm, { open: false, login: '', password: '' })
    await refresh()
  }
  catch (e) {
    toast.error(errorText(e, 'Не удалось сохранить ключ'))
  }
  finally {
    keyForm.saving = false
  }
}

async function deleteKey() {
  // Первый клик спрашивает, второй удаляет
  if (!confirmDeleteKey.value) {
    confirmDeleteKey.value = true
    return
  }
  confirmDeleteKey.value = false
  try {
    await adminFetch('/api/admin/demand/credentials', { method: 'DELETE' })
    toast.success('Ключ DataForSEO удалён — обновлений больше не будет')
    await refresh()
  }
  catch (e) {
    toast.error(errorText(e, 'Не удалось удалить ключ'))
  }
}

// --- Обновление (платное) ---
const refreshConfirmOpen = ref(false)
const starting = ref(false)
const lastDone = computed(() => ready.value?.runs.find(r => r.kind === 'volumes' && r.status === 'done') ?? null)
const updating = computed(() => !!ready.value?.pending)
const failedRuns = computed(() => {
  // Ошибки последнего обновления (пара запусков с одним временем запроса)
  const runs = ready.value?.runs ?? []
  const last = runs[0]
  return last ? runs.filter(r => r.requested_at === last.requested_at && r.status === 'failed') : []
})

/*
 * Ответ DataForSEO база видит не сразу: pg_net обычно отдаёт его за секунды,
 * но бывает и через несколько минут. Первые 2 минуты спрашиваем каждые 4 с,
 * дальше каждые 15 с — до 10 минут; потом можно просто открыть страницу снова.
 */
let pollTimer: ReturnType<typeof setTimeout> | null = null
const pollingSince = ref<number | null>(null)
// Сбор ответа не удался — сказать прямо, а не крутить «идёт обновление» молча
const collectError = ref<string | null>(null)
watch(() => ready.value?.collectError, (e) => {
  if (e)
    collectError.value = e
})
const now = ref(Date.now())
const waitingLong = computed(() => pollingSince.value !== null && now.value - pollingSince.value > 60_000)
function stopPolling() {
  if (pollTimer)
    clearTimeout(pollTimer)
  pollTimer = null
}
function poll(attempt = 0) {
  stopPolling()
  pollingSince.value ??= Date.now()
  pollTimer = setTimeout(async () => {
    pollTimer = null
    now.value = Date.now()
    try {
      const res = await adminFetch<{ finished: number, pending: number }>('/api/admin/demand/collect', { method: 'POST' })
      if (res.pending && now.value - pollingSince.value! < 10 * 60_000) {
        poll(attempt + 1)
        return
      }
      pollingSince.value = null
      collectError.value = null
      await refresh()
      if (!res.pending)
        toast.success('Спрос обновлён')
    }
    catch (e) {
      pollingSince.value = null
      collectError.value = errorText(e, 'Не удалось забрать ответ DataForSEO')
      toast.error(collectError.value)
    }
  }, attempt < 30 ? 4000 : 15000)
}
// Открыли страницу посреди обновления — ждать ответа так же (если сбор не сломан)
watch(updating, (busy) => {
  if (busy && !pollTimer && !collectError.value)
    poll()
}, { immediate: true })
onBeforeUnmount(stopPolling)

async function startRefresh() {
  refreshConfirmOpen.value = false
  if (starting.value)
    return
  starting.value = true
  try {
    await adminFetch('/api/admin/demand/refresh', { method: 'POST' })
    toast.info('Запрос ушёл в DataForSEO — ответ обычно приходит за минуту')
    await refresh()
    poll()
  }
  catch (e) {
    toast.error(errorText(e, 'Не удалось запустить обновление'))
  }
  finally {
    starting.value = false
  }
}

// --- Вордстат ---
const yandex = computed(() => ready.value?.yandex ?? null)
const yKeyForm = reactive({ open: false, apiKey: '', folderId: '', saving: false })
const confirmDeleteYKey = ref(false)

async function saveYandexKey() {
  if (yKeyForm.saving || !yKeyForm.apiKey.trim() || !yKeyForm.folderId.trim())
    return
  yKeyForm.saving = true
  try {
    const res = await adminFetch<{ folderId: string, last4: string, region: string }>('/api/admin/demand/yandex/key', {
      method: 'POST',
      body: { apiKey: yKeyForm.apiKey, folderId: yKeyForm.folderId },
    })
    toast.success(`Ключ Вордстата проверен и сохранён · регион ${res.region}`)
    Object.assign(yKeyForm, { open: false, apiKey: '', folderId: '' })
    await refresh()
  }
  catch (e) {
    toast.error(errorText(e, 'Не удалось сохранить ключ'))
  }
  finally {
    yKeyForm.saving = false
  }
}

async function deleteYandexKey() {
  // Первый клик спрашивает, второй удаляет
  if (!confirmDeleteYKey.value) {
    confirmDeleteYKey.value = true
    return
  }
  confirmDeleteYKey.value = false
  try {
    await adminFetch('/api/admin/demand/yandex/key', { method: 'DELETE' })
    toast.success('Ключ Вордстата удалён — обновлений больше не будет')
    await refresh()
  }
  catch (e) {
    toast.error(errorText(e, 'Не удалось удалить ключ'))
  }
}

/*
 * Ход обновления. Запросы уходят из базы сами (тик раз в 30 секунд), страница
 * только смотрит: первые 2 минуты каждые 5 с, дальше каждые 15 с.
 */
const yProgress = ref<YandexProgress | null>(null)
watch(() => yandex.value?.progress, (p) => {
  yProgress.value = p ?? null
}, { immediate: true })
const yRun = computed(() => yProgress.value?.run ?? null)
const yRunning = computed(() => yRun.value?.status === 'pending')
const yStale = computed(() => yProgress.value?.stale ?? 0)
const yMonth = computed(() => monthLabel(yProgress.value?.month))
const yPausedUntil = computed(() => {
  const until = yRun.value?.paused_until
  return until && new Date(until).getTime() > Date.now() ? until : null
})
const yStarting = ref(false)
let yTimer: ReturnType<typeof setTimeout> | null = null
let yPollingSince = 0
function stopYandexPolling() {
  if (yTimer)
    clearTimeout(yTimer)
  yTimer = null
}
function pollYandex() {
  stopYandexPolling()
  yPollingSince ||= Date.now()
  yTimer = setTimeout(async () => {
    yTimer = null
    try {
      const progress = await adminFetch<YandexProgress>('/api/admin/demand/yandex')
      yProgress.value = progress
      if (progress.run?.status === 'pending') {
        pollYandex()
        return
      }
      yPollingSince = 0
      await refresh()
      if (progress.run?.status === 'failed')
        toast.error(progress.run.error ?? 'Обновление Вордстата не удалось')
      else
        toast.success('Вордстат обновлён')
    }
    catch (e) {
      yPollingSince = 0
      toast.error(errorText(e, 'Не удалось узнать, как идёт обновление Вордстата'))
    }
  }, Date.now() - yPollingSince < 120_000 ? 5000 : 15000)
}
watch(yRunning, (running) => {
  if (running && !yTimer)
    pollYandex()
}, { immediate: true })
onBeforeUnmount(stopYandexPolling)

async function startYandex() {
  if (yStarting.value)
    return
  yStarting.value = true
  try {
    await adminFetch('/api/admin/demand/yandex/refresh', { method: 'POST' })
    toast.info('Запросы ушли в Вордстат — понемногу, под его квоту. Страницу можно закрыть')
    yProgress.value = await adminFetch<YandexProgress>('/api/admin/demand/yandex')
  }
  catch (e) {
    toast.error(errorText(e, 'Не удалось запустить обновление Вордстата'))
  }
  finally {
    yStarting.value = false
  }
}

// --- Темы ---
const SOURCES: Array<{ id: DemandSource, label: string }> = [
  { id: 'google', label: 'Google' },
  { id: 'yandex', label: 'Яндекс' },
]
const source = ref<DemandSource>('google')
const otherSource = computed<DemandSource>(() => (source.value === 'google' ? 'yandex' : 'google'))
const hasYandexNumbers = computed(() => (ready.value?.topics ?? []).some(t => t.y_series))
watch(hasYandexNumbers, (has) => {
  if (!has)
    source.value = 'google'
})
const filter = ref<DemandFilter>('all')
const search = ref('')
const topics = computed(() => sortDemandTopics(ready.value?.topics ?? [], source.value))
const filterCounts = computed(() =>
  Object.fromEntries(DEMAND_FILTERS.map(f => [f.id, topics.value.filter(t => matchesDemandFilter(t, f.id, source.value)).length])) as Record<DemandFilter, number>)
const shown = computed(() => {
  const q = search.value.trim().toLocaleLowerCase('ru-RU')
  return topics.value
    .filter(t => matchesDemandFilter(t, filter.value, source.value)
      && (!q || t.name.toLocaleLowerCase('ru-RU').includes(q) || t.keywords.some(k => k.includes(q))))
    .map(t => ({ topic: t, stats: demandStats(t, source.value), other: demandStats(t, otherSource.value).volume_avg3 }))
})
const hasNumbers = computed(() => topics.value.some(t => demandStats(t, source.value).series))
const dataUntil = computed(() => dataUntilLabel(topics.value.map(t => demandStats(t, source.value).data_until).find(Boolean) ?? null))

function trendClass(pct: number | null) {
  const kind = trendKind(pct)
  return kind === 'up' ? 'text-green-700' : kind === 'down' ? 'text-red-700' : 'text-muted-foreground'
}

// --- Окно темы ---
const editor = reactive({
  open: false,
  id: null as string | null,
  name: '',
  kind: 'type' as 'type' | 'franchise',
  keywords: '',
  matchTerms: '',
  yandexPhrase: '',
  isActive: true,
  fromCandidate: null as string | null,
  saving: false,
  confirmDelete: false,
})

function openNew(candidate?: DemandCandidate) {
  Object.assign(editor, {
    open: true,
    id: null,
    name: candidate ? topicNameFromKeyword(candidate.keyword) : '',
    kind: 'type',
    keywords: candidate?.keyword ?? '',
    matchTerms: '',
    yandexPhrase: '',
    isActive: true,
    fromCandidate: candidate?.keyword ?? null,
    confirmDelete: false,
  })
}

function openEdit(t: DemandTopic) {
  Object.assign(editor, {
    open: true,
    id: t.topic_id,
    name: t.name,
    kind: t.kind,
    keywords: t.keywords.join('\n'),
    matchTerms: t.match_terms.join('\n'),
    yandexPhrase: t.yandex_phrase ?? '',
    isActive: t.is_active,
    fromCandidate: null,
    confirmDelete: false,
  })
}

async function saveTopic() {
  if (editor.saving)
    return
  editor.saving = true
  const body = {
    name: editor.name,
    kind: editor.kind,
    keywords: parseDemandList(editor.keywords),
    match_terms: parseDemandList(editor.matchTerms),
    is_active: editor.isActive,
    // Без миграции Вордстата столбца нет — не слать, иначе тема не запишется
    ...(yandex.value ? { yandex_phrase: editor.yandexPhrase } : {}),
    fromCandidate: editor.fromCandidate ?? undefined,
  }
  try {
    if (editor.id)
      await adminFetch(`/api/admin/demand/topics/${editor.id}`, { method: 'PUT', body })
    else
      await adminFetch('/api/admin/demand/topics', { method: 'POST', body })
    toast.success(editor.id ? `Тема «${body.name}» сохранена` : `Тема «${body.name}» добавлена — цифры по новым фразам придут со следующим обновлением`)
    editor.open = false
    await refresh()
  }
  catch (e) {
    toast.error(errorText(e, 'Не удалось сохранить тему'))
  }
  finally {
    editor.saving = false
  }
}

async function deleteTopic() {
  if (!editor.id)
    return
  if (!editor.confirmDelete) {
    editor.confirmDelete = true
    return
  }
  try {
    await adminFetch(`/api/admin/demand/topics/${editor.id}`, { method: 'DELETE' })
    toast.success(`Тема «${editor.name}» удалена`)
    editor.open = false
    await refresh()
  }
  catch (e) {
    toast.error(errorText(e, 'Не удалось удалить тему'))
  }
}

// --- Новые запросы ---
const dismissing = ref<string | null>(null)
async function dismiss(c: DemandCandidate) {
  if (dismissing.value)
    return
  dismissing.value = c.keyword
  try {
    await adminFetch('/api/admin/demand/candidates', { method: 'POST', body: { keyword: c.keyword } })
    await refresh()
  }
  catch (e) {
    toast.error(errorText(e, 'Не удалось скрыть запрос'))
  }
  finally {
    dismissing.value = null
  }
}

const selectClass = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm'
</script>

<template>
  <div class="container mx-auto max-w-5xl space-y-6 p-4 md:p-8">
    <div class="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
      <div class="min-w-0">
        <h1 class="text-2xl font-bold tracking-tight md:text-3xl">
          Спрос на рынке
        </h1>
        <p class="mt-1 text-sm text-muted-foreground">
          Что ищут в Google и Яндексе в Казахстане — по темам товаров. По этим цифрам и отбирать товар у поставщиков.
        </p>
      </div>
      <Button variant="outline" size="sm" :disabled="pending" @click="refresh()">
        <RefreshCw class="mr-2 h-4 w-4" :class="{ 'animate-spin': pending }" />
        Обновить страницу
      </Button>
    </div>

    <ClientOnly>
      <p v-if="error" class="text-sm text-destructive">
        Не удалось загрузить: {{ error.statusMessage || error.message }}
      </p>
      <Skeleton v-else-if="pending && !data" class="h-64 w-full" />
      <Card v-else-if="data && !data.installed">
        <CardHeader>
          <CardTitle>Ещё не включено</CardTitle>
          <CardDescription>
            Таблиц спроса в базе пока нет — страница заработает, когда применят миграцию
            <span class="font-mono">20261101120000_market_demand</span>.
          </CardDescription>
        </CardHeader>
      </Card>
      <template v-else-if="ready">
        <!-- Ключ и обновление -->
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <KeyRound class="h-5 w-5" />
              DataForSEO
            </CardTitle>
            <CardDescription>
              Откуда цифры: Google Ads через DataForSEO. Обновление стоит около {{ formatUsd(DEMAND_REFRESH_COST) }} с баланса и само идёт 5-го числа каждого месяца.
            </CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-2" data-testid="demand-key-status">
              <div class="min-w-0 text-sm">
                <template v-if="ready.credentials">
                  <Badge class="bg-green-100 text-green-900 hover:bg-green-100">
                    ключ задан
                  </Badge>
                  <span class="ml-2 break-all font-mono">{{ ready.credentials.login }}</span>
                  <span class="ml-1 text-muted-foreground">••••{{ ready.credentials.last4 }}</span>
                  <span v-if="ready.credentials.balance != null" class="ml-2 whitespace-nowrap">
                    баланс <b>{{ formatUsd(ready.credentials.balance) }}</b>
                  </span>
                  <p v-if="ready.credentials.balanceError" class="mt-1 text-xs text-destructive">
                    Баланс не узнать: {{ ready.credentials.balanceError }}
                  </p>
                </template>
                <template v-else>
                  <Badge variant="outline">
                    ключ не задан
                  </Badge>
                  <span class="ml-2 text-muted-foreground">Без него спрос не обновляется.</span>
                </template>
              </div>
              <div v-if="ready.credentials" class="flex gap-2">
                <Button variant="outline" size="sm" @click="keyForm.open = !keyForm.open">
                  Заменить
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  :class="confirmDeleteKey ? 'border-destructive text-destructive' : ''"
                  @click="deleteKey"
                >
                  {{ confirmDeleteKey ? 'Точно удалить?' : 'Удалить' }}
                </Button>
              </div>
            </div>

            <form v-if="!ready.credentials || keyForm.open" class="space-y-2" data-testid="demand-key-form" @submit.prevent="saveKey">
              <div class="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <Input
                  v-model="keyForm.login"
                  autocomplete="off"
                  spellcheck="false"
                  aria-label="Логин API DataForSEO"
                  placeholder="Логин API"
                  class="font-mono"
                />
                <Input
                  v-model="keyForm.password"
                  type="password"
                  autocomplete="off"
                  spellcheck="false"
                  aria-label="Пароль API DataForSEO"
                  placeholder="Пароль API"
                  class="font-mono"
                />
                <Button type="submit" :disabled="keyForm.saving || !keyForm.login.trim() || !keyForm.password.trim()">
                  {{ keyForm.saving ? 'Проверяю…' : 'Проверить и сохранить' }}
                </Button>
              </div>
              <p class="text-xs text-muted-foreground">
                Логин API — не почта кабинета, а строка со страницы
                <a href="https://app.dataforseo.com/api-access" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-primary hover:underline">
                  API Access <ExternalLink class="h-3 w-3" />
                </a>. Ключ проверяется у DataForSEO (бесплатно) и хранится в базе зашифрованным.
              </p>
            </form>

            <div class="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div class="min-w-0 text-sm" data-testid="demand-run-status">
                <template v-if="updating">
                  <p class="flex items-center gap-2">
                    <RefreshCw class="h-4 w-4 animate-spin" />
                    Идёт обновление — ждём ответ DataForSEO…
                  </p>
                  <p v-if="waitingLong" class="mt-1 text-xs text-muted-foreground">
                    Ответ иногда доходит до базы через несколько минут. Страницу можно закрыть — цифры сохранятся сами.
                  </p>
                  <p v-if="collectError" class="mt-1 text-xs text-destructive" data-testid="demand-collect-error">
                    Ответ не разобран: {{ collectError }}
                  </p>
                </template>
                <p v-else-if="lastDone">
                  Обновлено {{ date(lastDone.finished_at) }}<span v-if="lastDone.scheduled"> (само, по расписанию)</span>
                </p>
                <p v-else class="text-muted-foreground">
                  Ещё не обновлялось.
                </p>
                <p v-for="r in failedRuns" :key="r.id" class="mt-1 text-xs text-destructive">
                  {{ r.kind === 'volumes' ? 'Спрос по темам' : 'Новые запросы' }}: {{ r.error }}
                </p>
              </div>
              <Button
                data-testid="demand-refresh"
                class="shrink-0"
                :disabled="!ready.credentials || updating || starting"
                @click="refreshConfirmOpen = true"
              >
                <RefreshCw class="mr-2 h-4 w-4" :class="{ 'animate-spin': starting }" />
                Обновить сейчас
              </Button>
            </div>
          </CardContent>
        </Card>

        <!-- Вордстат -->
        <Card v-if="ready.yandex" data-testid="yandex-card">
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <KeyRound class="h-5 w-5" />
              Яндекс Вордстат
            </CardTitle>
            <CardDescription>
              Что ищут в Яндексе в Казахстане — у него около трети поиска. Числа из Вордстата через Yandex Cloud: по фразе на тему,
              {{ formatKztCost(YANDEX_PHRASE_COST_KZT) }} за фразу, и спрашиваются только фразы без прошлого месяца. Само обновление идёт 5-го числа каждого месяца.
            </CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-2" data-testid="yandex-key-status">
              <div class="min-w-0 text-sm">
                <template v-if="ready.yandex.key">
                  <Badge class="bg-green-100 text-green-900 hover:bg-green-100">
                    ключ задан
                  </Badge>
                  <span class="ml-2 break-all font-mono">{{ ready.yandex.key.folderId }}</span>
                  <span class="ml-1 text-muted-foreground">••••{{ ready.yandex.key.last4 }}</span>
                  <span class="ml-2 whitespace-nowrap">регион <b>{{ ready.yandex.key.region }}</b></span>
                </template>
                <template v-else>
                  <Badge variant="outline">
                    ключ не задан
                  </Badge>
                  <span class="ml-2 text-muted-foreground">Без него числа Яндекса не обновляются.</span>
                </template>
              </div>
              <div v-if="ready.yandex.key" class="flex gap-2">
                <Button variant="outline" size="sm" @click="yKeyForm.open = !yKeyForm.open">
                  Заменить
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  :class="confirmDeleteYKey ? 'border-destructive text-destructive' : ''"
                  @click="deleteYandexKey"
                >
                  {{ confirmDeleteYKey ? 'Точно удалить?' : 'Удалить' }}
                </Button>
              </div>
            </div>

            <form v-if="!ready.yandex.key || yKeyForm.open" class="space-y-2" data-testid="yandex-key-form" @submit.prevent="saveYandexKey">
              <div class="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <Input
                  v-model="yKeyForm.apiKey"
                  type="password"
                  autocomplete="off"
                  spellcheck="false"
                  aria-label="API-ключ Yandex Cloud"
                  placeholder="API-ключ"
                  class="font-mono"
                />
                <Input
                  v-model="yKeyForm.folderId"
                  autocomplete="off"
                  spellcheck="false"
                  aria-label="ID каталога Yandex Cloud"
                  placeholder="ID каталога, b1g…"
                  class="font-mono"
                />
                <Button type="submit" :disabled="yKeyForm.saving || !yKeyForm.apiKey.trim() || !yKeyForm.folderId.trim()">
                  {{ yKeyForm.saving ? 'Проверяю…' : 'Проверить и сохранить' }}
                </Button>
              </div>
              <p class="text-xs text-muted-foreground">
                В
                <a href="https://console.yandex.cloud/" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-primary hover:underline">
                  консоли Yandex Cloud <ExternalLink class="h-3 w-3" />
                </a>
                — сервисный аккаунт с ролью <span class="font-mono">search-api.webSearch.user</span>, его API-ключ с областью
                <span class="font-mono">yc.search-api.execute</span> и ID каталога. Ключ проверяется в Вордстате бесплатно и хранится в базе зашифрованным.
              </p>
            </form>

            <div class="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div class="min-w-0 text-sm" data-testid="yandex-run-status">
                <template v-if="yRunning && yRun">
                  <p class="flex items-center gap-2">
                    <RefreshCw class="h-4 w-4 animate-spin" />
                    Идёт обновление: получено {{ yRun.done }} из {{ yRun.phrases }}
                  </p>
                  <p class="mt-1 text-xs text-muted-foreground">
                    <template v-if="yPausedUntil">
                      Квота Вордстата — 100 запросов в час; продолжу в {{ time(yPausedUntil) }}.
                    </template>
                    <template v-else>
                      Запросы уходят понемногу, под квоту Вордстата.
                    </template>
                    Страницу можно закрыть — числа сохранятся сами.
                  </p>
                </template>
                <template v-else>
                  <p v-if="!yProgress?.phrases" class="text-muted-foreground">
                    Нет отслеживаемых тем.
                  </p>
                  <p v-else-if="yStale">
                    Нет чисел за {{ yMonth }} по {{ phrasesDative(yStale) }} из {{ yProgress.phrases }}
                  </p>
                  <p v-else>
                    Числа за {{ yMonth }} есть по всем фразам
                  </p>
                  <p v-if="yProgress?.last_done_at" class="mt-1 text-xs text-muted-foreground">
                    Обновлено {{ date(yProgress.last_done_at) }}
                  </p>
                </template>
                <p v-if="yRun?.error && !yRunning" class="mt-1 text-xs text-destructive" data-testid="yandex-run-error">
                  {{ yRun.error }}
                </p>
                <template v-else-if="yRun?.failures.length">
                  <p v-for="f in yRun.failures.slice(0, 5)" :key="f.phrase" class="mt-1 text-xs text-destructive" data-testid="yandex-failure">
                    «{{ f.phrase }}»: {{ f.error }}
                  </p>
                  <p v-if="yRun.failed > 5" class="mt-1 text-xs text-destructive">
                    и ещё {{ yRun.failed - 5 }}
                  </p>
                </template>
              </div>
              <Button
                data-testid="yandex-refresh"
                class="shrink-0"
                :disabled="!ready.yandex.key || yRunning || yStarting || !yStale"
                @click="startYandex"
              >
                <RefreshCw class="mr-2 h-4 w-4" :class="{ 'animate-spin': yStarting }" />
                Обновить Яндекс<template v-if="ready.yandex.key && yStale && !yRunning">
                  · ≈ {{ formatKztCost(yStale * YANDEX_PHRASE_COST_KZT) }}
                </template>
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card v-else>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <KeyRound class="h-5 w-5" />
              Яндекс Вордстат
            </CardTitle>
            <CardDescription>
              Ещё не включён — появится, когда применят миграцию
              <span class="font-mono">20261102120000_market_demand_yandex</span>.
            </CardDescription>
          </CardHeader>
        </Card>

        <!-- Темы -->
        <Card>
          <CardHeader>
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div class="min-w-0">
                <CardTitle class="flex items-center gap-2">
                  <TrendingUp class="h-5 w-5" />
                  Темы
                </CardTitle>
                <CardDescription class="mt-1.5">
                  <template v-if="source === 'yandex'">
                    «В мес.» — сколько раз искали в Яндексе со словами главной фразы темы (в любой форме и с любыми другими словами), в среднем за 3 последних месяца; % — к тем же месяцам год назад.
                    Считается не так, как у Google: сравнивайте темы между собой, а не источники.
                  </template>
                  <template v-else>
                    «В мес.» — сколько раз искали, в среднем за 3 последних месяца; % — к тем же месяцам год назад.
                  </template>
                  <template v-if="dataUntil">
                    {{ source === 'yandex' ? 'Яндекс' : 'Google' }}: {{ dataUntil }}.
                  </template>
                </CardDescription>
              </div>
              <Button size="sm" variant="outline" class="shrink-0" @click="openNew()">
                <Plus class="mr-1 h-4 w-4" />
                Добавить тему
              </Button>
            </div>
          </CardHeader>
          <CardContent class="space-y-3">
            <div v-if="hasYandexNumbers" class="flex flex-wrap items-center gap-2" role="group" aria-label="Чьи числа">
              <span class="text-sm text-muted-foreground">Числа</span>
              <Button
                v-for="src in SOURCES"
                :key="src.id"
                size="sm"
                :variant="source === src.id ? 'default' : 'outline'"
                :aria-pressed="source === src.id"
                :data-testid="`demand-source-${src.id}`"
                @click="source = src.id"
              >
                {{ src.label }}
              </Button>
            </div>
            <div class="flex flex-wrap gap-2">
              <Button
                v-for="f in DEMAND_FILTERS"
                :key="f.id"
                size="sm"
                :variant="filter === f.id ? 'default' : 'outline'"
                :data-testid="`demand-filter-${f.id}`"
                @click="filter = f.id"
              >
                {{ f.label }} <span class="ml-1 tabular-nums opacity-70">{{ filterCounts[f.id] }}</span>
              </Button>
            </div>
            <div class="relative">
              <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input v-model="search" placeholder="Найти тему или фразу" aria-label="Найти тему" class="pl-9" />
            </div>

            <p v-if="!hasNumbers" class="rounded-md bg-muted p-3 text-sm text-muted-foreground">
              Цифр пока нет. {{ ready.credentials ? 'Нажмите «Обновить сейчас»' : 'Задайте ключ DataForSEO выше и нажмите «Обновить сейчас»' }} — придут спрос за 2 года и новые запросы.
            </p>
            <p v-if="!shown.length" class="py-6 text-center text-sm text-muted-foreground">
              Ничего не нашлось.
            </p>

            <div class="divide-y">
              <div
                v-for="{ topic: t, stats: st, other } in shown"
                :key="t.topic_id"
                data-testid="demand-topic"
                class="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4"
                :class="{ 'opacity-60': !t.is_active }"
              >
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span class="font-medium">{{ t.name }}</span>
                    <Badge v-if="t.kind === 'franchise'" variant="outline" class="font-normal">
                      персонаж или бренд
                    </Badge>
                    <Badge v-if="t.is_active && st.season_soon" class="bg-amber-100 font-normal text-amber-900 hover:bg-amber-100">
                      скоро сезон
                    </Badge>
                    <Badge v-if="!t.is_active" variant="outline" class="font-normal">
                      не отслеживается
                    </Badge>
                  </div>
                  <p class="truncate text-xs text-muted-foreground">
                    {{ source === 'yandex' && t.y_phrase ? `Вордстат: ${t.y_phrase}` : t.keywords.join(' · ') }}
                  </p>
                </div>

                <div class="flex items-center gap-3 sm:justify-end">
                  <svg
                    v-if="st.series"
                    width="96"
                    height="24"
                    viewBox="0 0 96 24"
                    class="shrink-0 text-primary"
                    aria-hidden="true"
                  >
                    <polyline :points="sparkPoints(st.series, 96, 24)" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
                  </svg>
                  <div class="min-w-[7.5rem] text-right">
                    <div class="whitespace-nowrap text-sm font-semibold tabular-nums">
                      {{ formatVolume(st.volume_avg3) }} <span class="font-normal text-muted-foreground">в мес.</span>
                    </div>
                    <div class="whitespace-nowrap text-xs">
                      <span :class="trendClass(st.trend_pct)">{{ trendLabel(st.trend_pct) ?? '—' }}</span>
                      <span v-if="peakLabel(st.peak_month) && (st.peak_ratio ?? 0) >= 1.3" class="text-muted-foreground"> · {{ peakLabel(st.peak_month) }}</span>
                    </div>
                    <div v-if="other != null" class="whitespace-nowrap text-xs text-muted-foreground" data-testid="demand-other-source">
                      {{ otherSource === 'yandex' ? 'Яндекс' : 'Google' }} {{ formatVolume(other) }}
                    </div>
                  </div>
                </div>

                <div class="flex items-center justify-between gap-2 sm:w-44 sm:justify-end">
                  <Badge v-if="t.our_total === 0 && (st.volume_avg3 ?? 0) > 0" class="bg-red-100 font-normal text-red-900 hover:bg-red-100">
                    у нас нет
                  </Badge>
                  <span v-else-if="t.our_total > 0" class="whitespace-nowrap text-xs">
                    у нас {{ t.our_total }}<template v-if="t.our_in_stock < t.our_total"> · в наличии {{ t.our_in_stock }}</template>
                  </span>
                  <span v-else />
                  <Button variant="ghost" size="icon" :aria-label="`Изменить тему ${t.name}`" @click="openEdit(t)">
                    <Pencil class="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- Новые запросы -->
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <Sparkles class="h-5 w-5" />
              Новые запросы на рынке
            </CardTitle>
            <CardDescription>
              Ищут рядом с «игрушками», а в темах этого нет. % — последние 3 месяца к 9 до них: растущее видно сразу.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p v-if="!ready.candidates.length" class="text-sm text-muted-foreground">
              Пока пусто — появятся после обновления.
            </p>
            <div class="divide-y">
              <div
                v-for="c in ready.candidates"
                :key="c.keyword"
                data-testid="demand-candidate"
                class="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4"
              >
                <div class="min-w-0 flex-1 font-medium">
                  {{ c.keyword }}
                </div>
                <div class="flex items-center gap-3">
                  <svg v-if="c.series" width="72" height="22" viewBox="0 0 72 22" class="shrink-0 text-primary" aria-hidden="true">
                    <polyline :points="sparkPoints(c.series, 72, 22)" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
                  </svg>
                  <div class="min-w-[7.5rem] text-right">
                    <div class="whitespace-nowrap text-sm font-semibold tabular-nums">
                      {{ formatVolume(c.search_volume) }} <span class="font-normal text-muted-foreground">в мес.</span>
                    </div>
                    <div class="whitespace-nowrap text-xs" :class="trendClass(c.trend_pct)">
                      {{ trendLabel(c.trend_pct) ?? '—' }}
                    </div>
                  </div>
                </div>
                <div class="flex gap-2 sm:justify-end">
                  <Button size="sm" variant="outline" @click="openNew(c)">
                    Сделать темой
                  </Button>
                  <Button size="sm" variant="ghost" :disabled="dismissing === c.keyword" @click="dismiss(c)">
                    Скрыть
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </template>
    </ClientOnly>

    <!-- Тема: новая или правка -->
    <Dialog v-model:open="editor.open">
      <DialogContent class="max-w-lg">
        <DialogHeader>
          <DialogTitle>{{ editor.id ? 'Тема' : 'Новая тема' }}</DialogTitle>
          <DialogDescription>
            Цифры по новым фразам придут со следующим обновлением.
          </DialogDescription>
        </DialogHeader>
        <form id="demand-topic-form" class="space-y-4" data-testid="demand-topic-form" @submit.prevent="saveTopic">
          <div class="space-y-1.5">
            <Label for="topic-name">Название</Label>
            <Input id="topic-name" v-model="editor.name" maxlength="80" />
          </div>
          <div class="space-y-1.5">
            <Label for="topic-kind">Что это</Label>
            <select id="topic-kind" v-model="editor.kind" :class="selectClass">
              <option value="type">
                Тип товара — толокар, пазлы, кукольный домик
              </option>
              <option value="franchise">
                Персонаж или бренд — лабубу, барби, LEGO
              </option>
            </select>
          </div>
          <div class="space-y-1.5">
            <Label for="topic-keywords">Как ищут в Google</Label>
            <Textarea id="topic-keywords" v-model="editor.keywords" rows="3" placeholder="по фразе в строке" />
            <p class="text-xs text-muted-foreground">
              До 10 фраз, как их набирают люди.
            </p>
          </div>
          <div v-if="yandex" class="space-y-1.5">
            <Label for="topic-yandex">Фраза для Вордстата</Label>
            <Input id="topic-yandex" v-model="editor.yandexPhrase" maxlength="120" :placeholder="parseDemandList(editor.keywords)[0] ?? 'по первой фразе'" />
            <p class="text-xs text-muted-foreground">
              Вордстат считает все запросы с этими словами в любой форме. Пусто — по первой фразе. Лишнее убирается минусом: «машинки -стрижки».
            </p>
          </div>
          <div class="space-y-1.5">
            <Label for="topic-terms">Как найти свой товар</Label>
            <Textarea id="topic-terms" v-model="editor.matchTerms" rows="2" placeholder="необязательно" />
            <p class="text-xs text-muted-foreground">
              Начало слова в названии товара, бренде или разделе: «стич» найдёт «Стич», но не «пластичный». «*» — что угодно между частями: «кукольн*дом». Пусто — по фразам.
            </p>
          </div>
          <div v-if="editor.id" class="flex items-center gap-2">
            <Switch id="topic-active" v-model="editor.isActive" />
            <Label for="topic-active">Отслеживать (спрашивать цифры у Google{{ yandex ? ' и Яндекса' : '' }})</Label>
          </div>
        </form>
        <DialogFooter class="gap-2 sm:justify-between">
          <Button
            v-if="editor.id"
            type="button"
            variant="outline"
            :class="editor.confirmDelete ? 'border-destructive text-destructive' : ''"
            @click="deleteTopic"
          >
            {{ editor.confirmDelete ? 'Точно удалить?' : 'Удалить тему' }}
          </Button>
          <span v-else />
          <Button type="submit" form="demand-topic-form" :disabled="editor.saving || !editor.name.trim() || !parseDemandList(editor.keywords).length">
            {{ editor.saving ? 'Сохраняю…' : 'Сохранить' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Подтверждение платного обновления -->
    <AlertDialog v-model:open="refreshConfirmOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Обновить спрос сейчас?</AlertDialogTitle>
          <AlertDialogDescription>
            Два запроса в DataForSEO — около {{ formatUsd(DEMAND_REFRESH_COST) }} с баланса<template v-if="ready?.credentials?.balance != null">
              (сейчас {{ formatUsd(ready.credentials.balance) }})
            </template>.
            Ответ обычно приходит за минуту. Само обновление и так идёт 5-го числа каждого месяца.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Назад</AlertDialogCancel>
          <AlertDialogAction data-testid="demand-refresh-confirm" @click="startRefresh">
            Обновить за ≈ {{ formatUsd(DEMAND_REFRESH_COST) }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
