<script setup lang="ts">
import type { KaspiCandidate, KaspiFields, KaspiSnapshot, KaspiSource, KaspiSummary } from '@/utils/kaspiSnapshot'
import { StorageSerializers, useLocalStorage } from '@vueuse/core'
import { Bookmark, ClipboardPaste, ExternalLink, Flame, ImageUp, ListChecks, Sparkles, Trash2, Trophy } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import KaspiLine from '@/components/admin/purchasing/KaspiLine.vue'
import {
  decodeKaspiHash,
  isKaspiProductUrl,
  KASPI_WINDOW,
  kaspiBookmarklet,
  kaspiLineParts,
  kaspiSearchUrl,
  kaspiSummaries,
  parseKaspiCards,
  parseKaspiPage,
} from '@/utils/kaspiSnapshot'
import { formatVolume } from '@/utils/marketDemand'

/*
 * «Цифры Kaspi» (20 ноября 2026). Владелец 19.11: «по мимо гугла главный
 * источник еще каспи магазин»; 20.11 выбраны оба способа сразу:
 *  - кнопка в браузере: владелец открывает товар на Kaspi, жмёт закладку
 *    «Uhti ← Kaspi», и цена, отзывы, рейтинг и продавцы приходят сюда;
 *  - скриншот: его читает модель со страницы «Модели ИИ».
 * Сервер на kaspi.kz не ходит. Каждый замер хранится с датой: по двум замерам
 * одного товара видно, сколько отзывов добавилось — так оценивают продажи.
 *
 * Тот же день, следом: «сканирует товары которые есть у поставщиков отбирает
 * их по артикулам и картинкам … выдвигает в топ спрос товара». Очередь —
 * товары поставщиков без замера; «Найти на Kaspi» открывает поиск во вкладке
 * Kaspi, закладка на выдаче приносит все товары страницы, сервер сверяет по
 * артикулу, названию и фото (utils/kaspiMatch.ts) и сохраняет найденное сам.
 * Топ — Kaspi весит больше Google («на каспи больше»).
 */
definePageMeta({ layout: 'admin' })

interface PageData {
  installed: boolean
  topics: { id: string, name: string, active: boolean }[]
  offer: { id: string, postUrl: string, photoUrl: string | null, items: string[] } | null
  snapshots: KaspiSnapshot[]
  reading: { model: string, key: boolean }
}

const route = useRoute()
const router = useRouter()
const errorText = (e: any, fallback: string) => e?.data?.message || e?.statusMessage || fallback

const query = computed(() => ({
  topic: typeof route.query.topic === 'string' ? route.query.topic : '',
  offer: typeof route.query.offer === 'string' ? route.query.offer : '',
  item: Number(route.query.item) || 0,
}))

interface BoardRow {
  key: string
  offerId: string
  item: number
  name: string
  article: string | null
  photoUrl: string | null
  postUrl: string
  supplier: string
  google: number | null
  kaspi: KaspiSummary | null
  score: number
  hit: boolean
  absent: boolean
}
type Board = { installed: false } | { installed: true, queue: BoardRow[], top: BoardRow[], left: number }

const { data: board, refresh: refreshBoard } = useAsyncData('admin-kaspi-board', () => adminFetch<Board>('/api/admin/kaspi/board'), { server: false })
const boardReady = computed(() => (board.value?.installed ? board.value : null))

const { data, pending, error, refresh } = useAsyncData(
  'admin-kaspi',
  () => adminFetch<PageData>('/api/admin/kaspi', { query: query.value.offer ? { offer: query.value.offer } : query.value.topic ? { topic: query.value.topic } : {} }),
  { server: false, watch: [() => query.value.topic, () => query.value.offer] },
)

// --- Куда замер: тема или товар поставщика ---
/*
 * Закладку жмут на вкладке Kaspi; цифры открываются вкладкой с этой
 * страницей. Если браузер открыл новую — цель берётся из последней выбранной.
 */
// Объектом: по умолчанию null vueuse пишет строкой — «[object Object]»
const lastTarget = useLocalStorage<{ topic?: string, offer?: string, item?: number } | null>('admin-kaspi-target', null, { serializer: StorageSerializers.object })

function chooseTopic(id: string) {
  router.replace({ query: id ? { topic: id } : {} })
}
function chooseItem(i: number) {
  router.replace({ query: { offer: query.value.offer, item: String(i) } })
}

watch(query, (q) => {
  if (q.offer)
    lastTarget.value = { offer: q.offer, item: q.item }
  else if (q.topic)
    lastTarget.value = { topic: q.topic }
}, { immediate: true })

const targetName = computed(() => {
  const d = data.value
  if (!d)
    return ''
  if (d.offer)
    return d.offer.items[query.value.item] ?? d.offer.items[0] ?? ''
  return d.topics.find(t => t.id === query.value.topic)?.name ?? ''
})
const hasTarget = computed(() => !!data.value && (!!data.value.offer || !!data.value.topics.find(t => t.id === query.value.topic)))

// --- Цифры ---
const form = reactive({ url: '', title: '', price: '', reviews: '', rating: '', sellers: '', source: 'manual' as KaspiSource })
const fromPage = ref<{ found: number } | null>(null)
/** Выдача поиска от закладки */
const results = ref<KaspiCandidate[] | null>(null)
/** Для какого товара уже сверяли эту выдачу: «offer:item» */
const resultsFor = ref('')
const shot = reactive({ preview: '', reading: false, items: [] as KaspiFields[], error: '' })
const saving = ref(false)

function fill(f: Partial<KaspiFields> & { url?: string | null }, source: KaspiSource) {
  const s = (v: number | null | undefined) => (v == null ? '' : String(v))
  form.url = f.url ?? form.url
  form.title = f.title || form.title
  form.price = s(f.price)
  form.reviews = s(f.reviews)
  form.rating = f.rating == null ? '' : String(f.rating).replace('.', ',')
  form.sellers = s(f.sellers)
  form.source = source
}

/** Сырьё от закладки — в части адреса после «#»: на сервер оно не уходит */
function takeHash() {
  const raw = decodeKaspiHash(window.location.hash)
  if (!raw)
    return
  // Выдача поиска — товары страницы; страница товара — его цифры, как раньше
  const cards = isKaspiProductUrl(raw.url) ? [] : parseKaspiCards(raw)
  if (cards.length) {
    results.value = cards
    resultsFor.value = ''
    history.replaceState(history.state, '', `${window.location.pathname}${window.location.search}`)
    return
  }
  const parsed = parseKaspiPage(raw)
  fill(parsed, 'page')
  // Название со страницы Kaspi — целиком, даже если в форме было другое
  form.title = parsed.title
  form.url = parsed.url ?? ''
  fromPage.value = { found: parsed.found.filter(k => k !== 'title').length }
  // Сырьё в адресе больше не нужно: перезагрузка не должна заполнять форму снова
  history.replaceState(history.state, '', `${window.location.pathname}${window.location.search}`)
}

// --- Выдача поиска: сверка и сохранение ---
interface MatchOutcome {
  pick: number | null
  by: 'article' | 'name' | 'photo' | null
  ranked: number[]
  photo: string
}
const matching = ref(false)
const outcome = ref<MatchOutcome | null>(null)
/** Сохранённый из выдачи замер: номер в выдаче и id — «Не то» его заменит */
const saved = ref<{ index: number, id: number } | null>(null)
const BY_TEXT: Record<'article' | 'name' | 'photo' | 'manual', string> = { article: 'по артикулу', name: 'по названию', photo: 'по фото', manual: 'выбрано вами' }
const savedBy = ref<keyof typeof BY_TEXT | null>(null)
const PHOTO_TEXT: Record<string, string> = {
  'key': 'по фото не сверял — нет ключа ИИ',
  'no-photo': 'по фото не сверял — у товара поставщика нет фото',
  'no-images': 'по фото не сверял — в выдаче нет картинок',
}

const orderedResults = computed(() => {
  const list = results.value ?? []
  const order = outcome.value?.ranked ?? list.map((_, i) => i)
  return order.filter(i => list[i]).map(i => ({ index: i, c: list[i]! }))
})

async function saveCandidate(index: number, by: keyof typeof BY_TEXT) {
  const c = results.value?.[index]
  if (!c)
    return
  if (!query.value.offer) {
    // Тема — цифры в форму, сохраняет владелец
    fill(c, 'page')
    form.title = c.title
    form.url = c.url
    return
  }
  saving.value = true
  try {
    if (saved.value)
      await adminFetch(`/api/admin/kaspi/snapshots/${saved.value.id}`, { method: 'DELETE' })
    const snap = await adminFetch<KaspiSnapshot>('/api/admin/kaspi/snapshots', {
      method: 'POST',
      body: { offerId: query.value.offer, offerItem: query.value.item, url: c.url, title: c.title, price: c.price, reviews: c.reviews, rating: c.rating, sellers: c.sellers, source: 'page' },
    })
    saved.value = { index, id: snap.id }
    savedBy.value = by
    toast.success(`Kaspi: «${c.title}» — ${BY_TEXT[by]}`)
    await Promise.all([refresh(), refreshBoard()])
  }
  catch (e) {
    toast.error(errorText(e, 'Не удалось сохранить'))
  }
  finally {
    saving.value = false
  }
}

async function runMatch() {
  const list = results.value
  const key = `${query.value.offer}:${query.value.item}`
  if (!list?.length || !query.value.offer || resultsFor.value === key || matching.value)
    return
  resultsFor.value = key
  outcome.value = null
  saved.value = null
  savedBy.value = null
  matching.value = true
  try {
    const res = await adminFetch<MatchOutcome>('/api/admin/kaspi/match', {
      method: 'POST',
      body: { offerId: query.value.offer, item: query.value.item, candidates: list },
    })
    outcome.value = res
    if (res.pick != null && res.by)
      await saveCandidate(res.pick, res.by)
  }
  catch (e) {
    toast.error(errorText(e, 'Не удалось сверить с выдачей'))
  }
  finally {
    matching.value = false
  }
}
watch([results, () => query.value.offer, () => query.value.item], runMatch)

/** Нет на Kaspi: замер «0 продавцов» — товар уходит из очереди */
async function markAbsent() {
  if (!query.value.offer || saving.value)
    return
  saving.value = true
  try {
    await adminFetch('/api/admin/kaspi/snapshots', {
      method: 'POST',
      body: { offerId: query.value.offer, offerItem: query.value.item, title: 'Нет на Kaspi', sellers: 0, source: 'manual' },
    })
    toast.success('Отмечено: на Kaspi такого нет')
    results.value = null
    await Promise.all([refresh(), refreshBoard()])
  }
  catch (e) {
    toast.error(errorText(e, 'Не удалось сохранить'))
  }
  finally {
    saving.value = false
  }
}

// --- Очередь ---
const KASPI_SEARCH_WINDOW = 'uhti-kaspi-search'
const currentKey = computed(() => (query.value.offer ? `${query.value.offer}:${query.value.item}` : ''))
const nextInQueue = computed(() => boardReady.value?.queue.find(r => r.key !== currentKey.value) ?? null)

/** Взять товар из очереди и открыть его поиск во вкладке Kaspi — по нажатию, иначе браузер не откроет */
function openFor(row: BoardRow) {
  results.value = null
  outcome.value = null
  saved.value = null
  router.replace({ query: { offer: row.offerId, item: String(row.item) } })
  window.open(kaspiSearchUrl(row.name), KASPI_SEARCH_WINDOW)
}

const origin = ref('')
onMounted(() => {
  // Имя вкладки — закладка откроет цифры здесь же, а не новой вкладкой
  window.name = KASPI_WINDOW
  origin.value = window.location.origin
  const fromBookmark = !!decodeKaspiHash(window.location.hash)
  takeHash()
  // Закладка открыла новую вкладку без цели — цель последняя выбранная
  if (fromBookmark && !query.value.topic && !query.value.offer && lastTarget.value) {
    const t = lastTarget.value
    router.replace({ query: t.offer ? { offer: t.offer, item: String(t.item ?? 0) } : { topic: t.topic } })
  }
  window.addEventListener('hashchange', takeHash)
  window.addEventListener('paste', onPaste)
})
onBeforeUnmount(() => {
  window.removeEventListener('hashchange', takeHash)
  window.removeEventListener('paste', onPaste)
})

const bookmarklet = computed(() => (origin.value ? kaspiBookmarklet(origin.value) : '#'))
const canSave = computed(() => hasTarget.value && [form.price, form.reviews, form.rating, form.sellers].some(v => String(v).trim()))

async function save() {
  if (!canSave.value || saving.value)
    return
  saving.value = true
  try {
    await adminFetch('/api/admin/kaspi/snapshots', {
      method: 'POST',
      body: {
        topicId: data.value?.offer ? null : query.value.topic,
        offerId: data.value?.offer?.id ?? null,
        offerItem: data.value?.offer ? query.value.item : null,
        url: form.url.trim() || null,
        title: form.title,
        price: form.price,
        reviews: form.reviews,
        rating: form.rating,
        sellers: form.sellers,
        source: form.source,
      },
    })
    toast.success('Цифры Kaspi сохранены')
    Object.assign(form, { url: '', title: '', price: '', reviews: '', rating: '', sellers: '', source: 'manual' })
    fromPage.value = null
    shot.items = []
    await refresh()
  }
  catch (e) {
    toast.error(errorText(e, 'Не удалось сохранить'))
  }
  finally {
    saving.value = false
  }
}

// --- Скриншот ---
const fileInput = ref<HTMLInputElement | null>(null)

/** Сжать до JPEG не больше 2000 px по большей стороне: тело запроса к серверу ограничено */
async function toJpeg(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const k = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * k)
  canvas.height = Math.round(bitmap.height * k)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.85)
}

async function takeImage(file: Blob | null | undefined) {
  if (!file || !file.type.startsWith('image/'))
    return
  shot.error = ''
  shot.items = []
  try {
    shot.preview = await toJpeg(file)
  }
  catch {
    shot.error = 'Не удалось открыть картинку'
  }
}

function onPaste(e: ClipboardEvent) {
  const item = Array.from(e.clipboardData?.items ?? []).find(i => i.type.startsWith('image/'))
  if (item)
    takeImage(item.getAsFile())
}

async function readShot() {
  if (!shot.preview || shot.reading)
    return
  shot.reading = true
  shot.error = ''
  try {
    const res = await adminFetch<{ items: KaspiFields[], error: string | null, off: 'key' | null }>('/api/admin/kaspi/read', {
      method: 'POST',
      body: { mediaType: 'image/jpeg', data: shot.preview.slice(shot.preview.indexOf(',') + 1) },
    })
    if (res.off === 'key') {
      shot.error = 'Нет ключа ИИ — задайте его на странице «Модели ИИ»'
      return
    }
    shot.items = res.items
    shot.error = res.error ?? ''
    if (res.items.length === 1)
      fill(res.items[0]!, 'screenshot')
  }
  catch (e) {
    shot.error = errorText(e, 'Не удалось прочитать скриншот')
  }
  finally {
    shot.reading = false
  }
}

// --- Замеры ---
const summary = computed(() => {
  const list = data.value?.snapshots ?? []
  return list.length ? kaspiSummaries(list, () => 'all').get('all')! : null
})
const SOURCE_LABEL: Record<KaspiSource, string> = { page: 'кнопка', screenshot: 'скриншот', manual: 'вручную' }
const confirmDelete = ref<number | null>(null)

async function remove(s: KaspiSnapshot) {
  if (confirmDelete.value !== s.id) {
    confirmDelete.value = s.id
    return
  }
  confirmDelete.value = null
  try {
    await adminFetch(`/api/admin/kaspi/snapshots/${s.id}`, { method: 'DELETE' })
    await refresh()
  }
  catch (e) {
    toast.error(errorText(e, 'Не удалось удалить'))
  }
}

function when(iso: string) {
  return new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
/** Цифры одного замера или товара со скриншота — как строка «Kaspi»: только то, что есть */
function fieldsLine(f: KaspiFields) {
  const last: KaspiSnapshot = { id: 0, topicId: null, offerId: null, offerItem: null, url: null, source: 'manual', takenAt: '', ...f }
  return kaspiLineParts({ last, reviewsGrowth: null, growthDays: null, count: 1 }).join(' · ') || '—'
}

useHead({ title: 'Цифры Kaspi' })
</script>

<template>
  <div class="container mx-auto max-w-3xl space-y-6 p-4 md:p-8">
    <div>
      <NuxtLink to="/admin/purchasing" class="text-sm text-muted-foreground hover:text-foreground">
        ← Умный закуп
      </NuxtLink>
      <h1 class="mt-1 text-2xl font-bold tracking-tight md:text-3xl">
        Цифры Kaspi
      </h1>
      <p class="mt-1 text-sm text-muted-foreground">
        Цена, отзывы, рейтинг и продавцы с Kaspi у темы спроса или товара поставщика. Сайт на Kaspi сам не ходит — цифры приносите вы: кнопкой в браузере или скриншотом.
      </p>
    </div>

    <!-- Данные — только в браузере (server: false): без ClientOnly гидрация расходится со «Загрузкой…» -->
    <ClientOnly>
      <p v-if="error" class="text-sm text-destructive">
        {{ errorText(error, 'Не удалось загрузить') }}
      </p>
      <p v-else-if="pending && !data" class="text-sm text-muted-foreground">
        Загрузка…
      </p>

      <template v-else-if="data">
        <p v-if="!data.installed" class="rounded-md bg-amber-50 p-3 text-sm text-amber-900" data-testid="kaspi-not-installed">
          Сохранять пока некуда: миграцию 20261120120000 применяют кнопкой в CI («Миграции Supabase», APPLY).
        </p>

        <!-- Выдача поиска от закладки -->
        <Card v-if="results" data-testid="kaspi-results">
          <CardHeader>
            <CardTitle>Выдача Kaspi: {{ results.length }} {{ results.length === 1 ? 'товар' : results.length < 5 ? 'товара' : 'товаров' }}</CardTitle>
            <CardDescription v-if="!query.offer">
              Выберите товар — его цифры встанут в форму ниже.
            </CardDescription>
          </CardHeader>
          <CardContent class="space-y-3">
            <p v-if="matching" class="text-sm text-muted-foreground" data-testid="kaspi-matching">
              Сверяю по артикулу, названию и фото…
            </p>
            <p v-else-if="saved && savedBy" class="rounded-md bg-green-50 p-3 text-sm text-green-900" data-testid="kaspi-match-saved">
              Сохранено {{ BY_TEXT[savedBy] }}: «{{ results[saved.index]?.title }}». Не тот товар — выберите другой ниже.
            </p>
            <p v-else-if="outcome && outcome.pick == null" class="rounded-md bg-amber-50 p-3 text-sm text-amber-900" data-testid="kaspi-match-none">
              Уверенно не нашёл{{ PHOTO_TEXT[outcome.photo] ? ` (${PHOTO_TEXT[outcome.photo]})` : outcome.photo !== 'done' && outcome.photo !== 'skipped' ? ` (фото: ${outcome.photo})` : '' }}. Выберите тот же товар или отметьте, что на Kaspi его нет.
            </p>
            <div class="max-h-[28rem] divide-y overflow-y-auto rounded-md border">
              <button
                v-for="{ index, c } in orderedResults"
                :key="c.url"
                type="button"
                class="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted"
                :class="{ 'bg-green-50': saved?.index === index }"
                :disabled="saving"
                data-testid="kaspi-result"
                @click="saveCandidate(index, 'manual')"
              >
                <img v-if="c.image" :src="c.image" alt="" loading="lazy" referrerpolicy="no-referrer" class="size-10 shrink-0 rounded border object-contain">
                <span class="min-w-0 flex-1">
                  <span class="line-clamp-2 font-medium">{{ c.title }}</span>
                  <span class="text-xs text-muted-foreground">{{ fieldsLine(c) }}</span>
                </span>
              </button>
            </div>
            <div v-if="query.offer" class="flex flex-wrap gap-2">
              <Button v-if="!saved" variant="outline" size="sm" :disabled="saving" data-testid="kaspi-absent" @click="markAbsent">
                На Kaspi такого нет
              </Button>
              <Button v-if="nextInQueue && (saved || !results)" size="sm" data-testid="kaspi-next" @click="openFor(nextInQueue)">
                Следующий: найти «{{ nextInQueue.name }}» на Kaspi
              </Button>
            </div>
          </CardContent>
        </Card>

        <!-- Очередь -->
        <Card v-if="boardReady" data-testid="kaspi-queue">
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <ListChecks class="h-5 w-5" /> Проверить на Kaspi
            </CardTitle>
            <CardDescription>
              Новые товары поставщиков без цифр Kaspi, сначала с большим поиском в Google. «Найти» открывает поиск во вкладке Kaspi — там нажмите закладку «Uhti ← Kaspi», остальное сделается само.
            </CardDescription>
          </CardHeader>
          <CardContent class="space-y-2">
            <p v-if="!boardReady.queue.length" class="text-sm text-muted-foreground">
              Все товары проверены.
            </p>
            <div v-else class="divide-y">
              <div
                v-for="r in boardReady.queue.slice(0, 8)"
                :key="r.key"
                class="flex items-center gap-3 py-2"
                :class="{ 'rounded-md bg-muted/60 px-2': r.key === currentKey }"
                data-testid="kaspi-queue-row"
              >
                <img v-if="r.photoUrl" :src="r.photoUrl" alt="" loading="lazy" class="size-10 shrink-0 rounded border object-contain">
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-medium">
                    {{ r.name }}
                  </p>
                  <p class="truncate text-xs text-muted-foreground">
                    {{ r.supplier }}<template v-if="r.article">
                      · арт. {{ r.article }}
                    </template><template v-if="r.google != null">
                      · Google {{ formatVolume(r.google) }}/мес.
                    </template>
                  </p>
                </div>
                <Button size="sm" variant="outline" class="shrink-0" data-testid="kaspi-queue-find" @click="openFor(r)">
                  Найти
                </Button>
              </div>
            </div>
            <p v-if="boardReady.left > 8" class="text-xs text-muted-foreground">
              И ещё {{ boardReady.left - 8 }} в очереди.
            </p>
          </CardContent>
        </Card>

        <!-- Топ -->
        <Card v-if="boardReady && boardReady.top.length" data-testid="kaspi-top">
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <Trophy class="h-5 w-5" /> Топ спроса
            </CardTitle>
            <CardDescription>
              Kaspi весит больше Google: отзывы — это уже покупки, а прирост отзывов между замерами — продажи сейчас.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol class="divide-y">
              <li v-for="(r, n) in boardReady.top.slice(0, 20)" :key="r.key" class="flex items-center gap-3 py-2" data-testid="kaspi-top-row">
                <span class="w-5 shrink-0 text-right text-sm tabular-nums text-muted-foreground">{{ n + 1 }}</span>
                <img v-if="r.photoUrl" :src="r.photoUrl" alt="" loading="lazy" class="size-10 shrink-0 rounded border object-contain">
                <div class="min-w-0 flex-1">
                  <p class="flex items-center gap-2 text-sm font-medium">
                    <span class="truncate">{{ r.name }}</span>
                    <span v-if="r.hit" class="inline-flex shrink-0 items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800" data-testid="kaspi-hit">
                      <Flame class="h-3 w-3" /> Хит Kaspi
                    </span>
                  </p>
                  <KaspiLine :summary="r.kaspi" :to="`/admin/kaspi?offer=${r.offerId}&item=${r.item}`" />
                  <p class="truncate text-xs text-muted-foreground">
                    {{ r.supplier }}<template v-if="r.google != null">
                      · Google {{ formatVolume(r.google) }}/мес.
                    </template>
                  </p>
                </div>
              </li>
            </ol>
          </CardContent>
        </Card>

        <!-- Куда -->
        <Card>
          <CardHeader>
            <CardTitle>Куда</CardTitle>
            <CardDescription v-if="!data.offer">
              Тема спроса. Для товара поставщика нажмите строку «Kaspi» на его карточке в «Товарах поставщиков».
            </CardDescription>
          </CardHeader>
          <CardContent class="space-y-3">
            <div v-if="data.offer" class="flex gap-3" data-testid="kaspi-offer">
              <img v-if="data.offer.photoUrl" :src="data.offer.photoUrl" alt="" class="size-16 shrink-0 rounded-lg border object-contain">
              <div class="min-w-0 space-y-1.5">
                <p class="text-xs text-muted-foreground">
                  Товар поставщика · <a :href="data.offer.postUrl" target="_blank" rel="noopener" class="text-primary hover:underline">пост</a>
                </p>
                <select
                  v-if="data.offer.items.length > 1"
                  class="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  aria-label="Товар в посте"
                  :value="query.item"
                  data-testid="kaspi-offer-item"
                  @change="chooseItem(Number(($event.target as HTMLSelectElement).value))"
                >
                  <option v-for="(name, i) in data.offer.items" :key="i" :value="i">
                    {{ name }}
                  </option>
                </select>
                <p v-else class="text-sm font-medium">
                  {{ data.offer.items[0] }}
                </p>
              </div>
            </div>
            <select
              v-else
              class="h-9 w-full rounded-md border bg-background px-2 text-sm"
              aria-label="Тема спроса"
              :value="query.topic"
              data-testid="kaspi-topic"
              @change="chooseTopic(($event.target as HTMLSelectElement).value)"
            >
              <option value="">
                Выберите тему
              </option>
              <option v-for="t in data.topics" :key="t.id" :value="t.id">
                {{ t.name }}{{ t.active ? '' : ' (не отслеживается)' }}
              </option>
            </select>
            <!-- rel="opener": закладка на вкладке Kaspi найдёт эту вкладку по имени и откроет цифры здесь же -->
            <a
              v-if="targetName"
              :href="kaspiSearchUrl(targetName)"
              :target="KASPI_SEARCH_WINDOW"
              rel="opener"
              class="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
              data-testid="kaspi-search"
            >
              Найти «{{ targetName }}» на Kaspi <ExternalLink class="h-3.5 w-3.5" />
            </a>
          </CardContent>
        </Card>

        <!-- Цифры -->
        <Card>
          <CardHeader>
            <CardTitle>Цифры</CardTitle>
            <CardDescription>
              Пришли кнопкой или со скриншота — проверьте и поправьте перед сохранением. Можно вписать и руками.
            </CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
            <p v-if="fromPage" class="rounded-md p-3 text-sm" :class="fromPage.found === 4 ? 'bg-green-50 text-green-900' : 'bg-amber-50 text-amber-900'" data-testid="kaspi-from-page">
              Со страницы Kaspi: нашлось {{ fromPage.found }} из 4 цифр.<template v-if="fromPage.found < 4">
                Остальное впишите или пришлите скриншот.
              </template>
            </p>

            <div class="grid gap-3 sm:grid-cols-2">
              <label class="space-y-1 sm:col-span-2">
                <span class="text-sm font-medium">Ссылка на товар Kaspi</span>
                <Input v-model="form.url" placeholder="https://kaspi.kz/shop/p/…" data-testid="kaspi-url" />
              </label>
              <label class="space-y-1 sm:col-span-2">
                <span class="text-sm font-medium">Название на Kaspi</span>
                <Input v-model="form.title" data-testid="kaspi-title" />
              </label>
              <label class="space-y-1">
                <span class="text-sm font-medium">Цена, ₸</span>
                <Input v-model="form.price" inputmode="numeric" data-testid="kaspi-price" />
              </label>
              <label class="space-y-1">
                <span class="text-sm font-medium">Отзывов</span>
                <Input v-model="form.reviews" inputmode="numeric" data-testid="kaspi-reviews" />
              </label>
              <label class="space-y-1">
                <span class="text-sm font-medium">Рейтинг</span>
                <Input v-model="form.rating" inputmode="decimal" placeholder="4,8" data-testid="kaspi-rating" />
              </label>
              <label class="space-y-1">
                <span class="text-sm font-medium">Продавцов</span>
                <Input v-model="form.sellers" inputmode="numeric" data-testid="kaspi-sellers" />
              </label>
            </div>

            <div class="flex flex-wrap items-center gap-3">
              <Button :disabled="!canSave || saving || !data.installed" data-testid="kaspi-save" @click="save">
                Сохранить
              </Button>
              <span v-if="!hasTarget" class="text-sm text-muted-foreground">Сначала выберите, куда</span>
            </div>

            <!-- Скриншот -->
            <div class="space-y-3 border-t pt-4" data-testid="kaspi-shot">
              <div class="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" @click="fileInput?.click()">
                  <ImageUp class="mr-2 h-4 w-4" /> Скриншот
                </Button>
                <span class="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ClipboardPaste class="h-3.5 w-3.5" /> или вставьте его сюда — Ctrl+V
                </span>
                <input ref="fileInput" type="file" accept="image/*" class="hidden" data-testid="kaspi-shot-file" @change="takeImage(($event.target as HTMLInputElement).files?.[0])">
              </div>
              <div v-if="shot.preview" class="flex flex-col gap-3 sm:flex-row sm:items-start">
                <img :src="shot.preview" alt="Скриншот Kaspi" class="max-h-48 w-auto rounded-md border object-contain">
                <div class="space-y-2">
                  <Button size="sm" :disabled="shot.reading || !data.reading.key" data-testid="kaspi-shot-read" @click="readShot">
                    <Sparkles class="mr-2 h-4 w-4" /> {{ shot.reading ? 'Читаю…' : 'Прочитать' }}
                  </Button>
                  <p class="text-xs text-muted-foreground">
                    {{ data.reading.key ? `Модель ${data.reading.model}, доли цента за скриншот` : 'Нет ключа ИИ — задайте его на странице «Модели ИИ»' }}
                  </p>
                </div>
              </div>
              <p v-if="shot.error" class="text-sm text-destructive" data-testid="kaspi-shot-error">
                {{ shot.error }}
              </p>
              <div v-if="shot.items.length > 1" class="space-y-1" data-testid="kaspi-shot-items">
                <p class="text-sm">
                  На скриншоте несколько товаров — выберите нужный:
                </p>
                <button
                  v-for="(it, i) in shot.items"
                  :key="i"
                  type="button"
                  class="block w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-muted"
                  data-testid="kaspi-shot-item"
                  @click="fill(it, 'screenshot')"
                >
                  <span class="font-medium">{{ it.title || 'Без названия' }}</span>
                  <span class="text-muted-foreground"> · {{ fieldsLine(it) }}</span>
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- Замеры -->
        <Card v-if="hasTarget">
          <CardHeader>
            <CardTitle>Замеры</CardTitle>
            <CardDescription>
              Замеряйте один и тот же товар раз в 1–2 недели: прирост отзывов показывает, как он продаётся.
            </CardDescription>
          </CardHeader>
          <CardContent class="space-y-3">
            <p v-if="summary" class="text-sm" data-testid="kaspi-summary">
              Последний: {{ kaspiLineParts(summary).join(' · ') }}
            </p>
            <p v-if="!data.snapshots.length" class="text-sm text-muted-foreground">
              Замеров ещё нет.
            </p>
            <div class="divide-y">
              <div v-for="s in data.snapshots" :key="s.id" class="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm" data-testid="kaspi-snapshot">
                <span class="w-36 shrink-0 text-muted-foreground">{{ when(s.takenAt) }}</span>
                <span class="min-w-0 flex-[1_1_12rem] truncate">
                  <a v-if="s.url" :href="s.url" target="_blank" rel="noopener" class="hover:underline">{{ s.title || s.url }}</a>
                  <template v-else>{{ s.title || '—' }}</template>
                </span>
                <span class="tabular-nums" data-testid="kaspi-snapshot-numbers">{{ fieldsLine(s) }}</span>
                <span class="text-xs text-muted-foreground">{{ SOURCE_LABEL[s.source] }}</span>
                <Button variant="ghost" size="sm" :aria-label="confirmDelete === s.id ? 'Точно удалить' : 'Удалить замер'" data-testid="kaspi-snapshot-delete" @click="remove(s)">
                  <Trash2 class="h-4 w-4" /><span v-if="confirmDelete === s.id" class="ml-1">Точно?</span>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- Кнопка в браузер -->
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <Bookmark class="h-5 w-5" /> Кнопка для Kaspi
            </CardTitle>
            <CardDescription>
              Ставится один раз. Перетащите её мышкой на панель закладок браузера.
            </CardDescription>
          </CardHeader>
          <CardContent class="space-y-3 text-sm">
            <!-- Ссылка-закладка: href — javascript:, собранный своим кодом (utils/kaspiSnapshot.ts) -->
            <a
              :href="bookmarklet"
              class="inline-flex items-center gap-2 rounded-md border-2 border-dashed px-4 py-2 font-medium"
              data-testid="kaspi-bookmarklet"
              @click.prevent="toast.info('Не нажимайте здесь — перетащите кнопку на панель закладок')"
            >
              <Bookmark class="h-4 w-4" /> Uhti ← Kaspi
            </a>
            <ol class="list-decimal space-y-1 pl-5 text-muted-foreground">
              <li>В «Проверить на Kaspi» нажмите «Найти» — поиск откроется во вкладке Kaspi.</li>
              <li>На выдаче поиска Kaspi (или на странице товара) нажмите закладку «Uhti ← Kaspi».</li>
              <li>Товар поставщика найдётся в выдаче сам — по артикулу, названию или фото — и сохранится; если не уверен, выберете вы.</li>
            </ol>
            <p class="text-xs text-muted-foreground">
              Закладка читает только открытую вами страницу и передаёт её сюда, в ваш же браузер. Если цифры не пришли — пришлите скриншот.
            </p>
          </CardContent>
        </Card>
      </template>
    </ClientOnly>
  </div>
</template>
